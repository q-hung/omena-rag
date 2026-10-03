import { sql } from 'drizzle-orm';
import { CATEGORIES } from './db/schema.ts';
import { db } from './db/index.ts';
import { rowsOf } from './upload.ts';

// REQ §4.2 (WF-05) and ANS-09. Derived, never stored.

export type ConversationState =
  | 'generating'
  | 'saved'
  | 'failed'
  | 'awaiting_clarification'
  | 'out_of_scope'
  | 'needs_review'
  | 'insufficient_evidence'
  | 'answer_ready';

export function deriveState(input: {
  generating?: boolean;
  saved?: boolean;
  hasAnswer?: boolean;
  outcome?: string | null;
  reviewReasons?: string[];
}): ConversationState {
  if (input.generating) return 'generating';
  if (input.saved) return 'saved';
  if (!input.hasAnswer) return 'failed';
  if (input.outcome === 'clarification_required') return 'awaiting_clarification';
  if (input.outcome === 'out_of_scope') return 'out_of_scope';
  if (input.reviewReasons?.length) return 'needs_review';
  if (input.outcome === 'insufficient_evidence') return 'insufficient_evidence';
  return 'answer_ready';
}

/** WF-05 order, same predicates as deriveState. Used by History list (T26). */
export const STATE_SQL = sql`
  case
    when c.generation_token is not null
      and c.generation_started_at > now() - interval '2 minutes' then 'generating'
    when r.conversation_id is not null then 'saved'
    when a.id is null or a.turn_id is distinct from lt.id then 'failed'
    when a.outcome = 'clarification_required' then 'awaiting_clarification'
    when a.outcome = 'out_of_scope' then 'out_of_scope'
    when jsonb_typeof(a.review_reasons) = 'array' and jsonb_array_length(a.review_reasons) > 0 then 'needs_review'
    when a.outcome = 'insufficient_evidence' then 'insufficient_evidence'
    else 'answer_ready'
  end
`;

export async function conversationStatesById(ids: number[]): Promise<Map<number, ConversationState>> {
  const states = new Map<number, ConversationState>();
  if (!ids.length) return states;
  const rows = rowsOf(
    await db().execute(sql`
      select c.id, ${STATE_SQL} as state
      from conversations c
      left join reviewed_answers r on r.conversation_id = c.id
      left join lateral (
        select id from turns where conversation_id = c.id order by seq desc limit 1
      ) lt on true
      left join lateral (
        select id, turn_id, outcome, review_reasons
        from answers
        where conversation_id = c.id
        order by id desc
        limit 1
      ) a on true
      where c.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `),
  );
  for (const row of rows) states.set(Number(row.id), row.state as ConversationState);
  return states;
}

export function lockHeld(startedAt: Date | null | undefined, now = Date.now()): boolean {
  return !!startedAt && now - startedAt.getTime() < 2 * 60_000;
}

export function topicsOf(input: {
  outcome?: string | null;
  citedCategories: string[];
  citedFacts: boolean;
}): string[] {
  if (!input.outcome || input.outcome === 'out_of_scope') return [];
  const have = new Set(input.citedCategories);
  const ordered = CATEGORIES.filter((c) => have.has(c));
  if (ordered.length) return [...ordered];
  if (input.citedFacts) return ['Account data'];
  return [];
}

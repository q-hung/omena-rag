import { sql } from 'drizzle-orm';
// REQ_V3 §4.4. First match wins. Derived, never stored.

export const QUESTION_REVIEW_STATES = [
  'processing',
  'failed',
  'not_generated',
  'accepted',
  'needs_work',
  'wrong_evidence',
  'draft',
] as const;

export type QuestionReviewState = (typeof QUESTION_REVIEW_STATES)[number];

export function deriveQuestionState(input: {
  status: string;
  hasAnswer: boolean;
  latestVerdict?: string | null;
}): QuestionReviewState {
  if (input.status === 'queued' || input.status === 'processing') {
    return 'processing';
  }
  if (input.status === 'failed' && !input.hasAnswer) {
    return 'failed';
  }
  if (!input.hasAnswer) {
    return 'not_generated';
  }
  if (input.latestVerdict === 'accepted') {
    return 'accepted';
  }
  if (input.latestVerdict === 'needs_work') {
    return 'needs_work';
  }
  if (input.latestVerdict === 'wrong_evidence') {
    return 'wrong_evidence';
  }
  return 'draft';
}

/** Same §4.4 order as deriveQuestionState, in SQL. Reads q (question), la (latest answer), lr (latest review of la). */
export const RFP_STATE_SQL = sql`
  case
    when q.status in ('queued', 'processing') then 'processing'
    when q.status = 'failed' and la.id is null then 'failed'
    when la.id is null then 'not_generated'
    when lr.verdict in ('accepted', 'needs_work', 'wrong_evidence') then lr.verdict
    else 'draft'
  end
`;

export const RFP_STATE_FROM = sql`
  rfp_questions q
  left join lateral (
    select id from rfp_answers where question_id = q.id order by id desc limit 1
  ) la on true
  left join lateral (
    select verdict from rfp_reviews where answer_id = la.id order by id desc limit 1
  ) lr on true
`;

import { CATEGORIES } from './db/schema.ts';

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

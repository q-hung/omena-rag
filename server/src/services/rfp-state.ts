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

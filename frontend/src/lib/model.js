// Display helpers. Rules live on the server (T26).

export const INGEST_STATUS = { ready: 'Ready', queued: 'Queued', processing: 'Processing', failed: 'Failed' };
export const INGEST_TONE = { ready: 'positive', queued: 'neutral', processing: 'alert', failed: 'negative' };

export const lastTurn = (c) => c.turns[c.turns.length - 1];
export const latestAnswer = (c) => c.answers?.[c.answers.length - 1] || null;
export const finalText = (a) => a?.edited ?? a?.text ?? '';

export const STATE_LABEL = {
  generating: 'Generating…', failed: 'Generation failed', answer_ready: 'Answer ready', needs_review: 'Needs review',
  awaiting_clarification: 'Needs clarification', insufficient_evidence: 'Insufficient evidence', out_of_scope: 'Out of scope', saved: 'Saved',
};
export const STATE_TONE = {
  generating: 'outline', failed: 'negative', answer_ready: 'outline', needs_review: 'alert',
  awaiting_clarification: 'alert', insufficient_evidence: 'neutral', out_of_scope: 'neutral', saved: 'positive',
};
export const OUTCOME_LABEL = {
  answer: 'Answer', clarification_required: 'Clarification required', insufficient_evidence: 'Insufficient evidence', out_of_scope: 'Out of scope',
};
export const REASON_TEXT = {
  conflict: ['CONFLICT', 'Sources disagree', 'Both passages are cited. Neither source wins automatically; decide which applies.'],
  policy_applicability: ['POLICY APPLICABILITY', 'Policy may not apply to this event', 'The cited policy took effect after the account event it would apply to.'],
  exception_unclear: ['EXCEPTION UNCLEAR', 'An exception may apply', 'The policy allows exceptions without stating criteria.'],
  invalid_citation_removed: ['CITATION REMOVED', 'A citation was removed', 'The answer referenced a source it wasn\'t given.'],
  no_valid_citation: ['NO VALID CITATION', 'Nothing in the answer is cited', 'It was downgraded to insufficient evidence.'],
};
export const GAP_LABEL = { no_record: 'No matching record', documentation: 'Not established by the documentation', user_input: 'Needs information from you' };

export const stripMarkers = (text) =>
  (text ?? '')
    .replace(/\[((?:[FS]\d+)(?:\s*[,;]\s*(?:[FS]\d+))+)\]/g, (_, inner) =>
      inner.split(/\s*[,;]\s*/).map((id) => `[${id}]`).join(''))
    .replace(/ ?\[(?:F?\d+|S\d+)\]/g, '');

export function saveHint(conv, { generating = false, editing = false, acknowledged = false } = {}) {
  if (generating) {
    return 'Wait for generation to finish.';
  }
  if (conv?.reviewed) {
    return 'This conversation is already saved.';
  }
  if (conv?.state === 'failed') {
    return 'The latest question has no answer. Retry first.';
  }
  if (conv?.state === 'awaiting_clarification') {
    return 'Clarification requests can\'t be saved. Reply first.';
  }
  if (conv?.state === 'out_of_scope') {
    return 'Out-of-scope answers can\'t be saved.';
  }
  if (editing) {
    return 'Save or cancel the edit first.';
  }
  const a = latestAnswer(conv);
  if (!finalText(a).trim()) {
    return 'The answer is empty.';
  }
  if (conv?.flags?.sourceUpdated) {
    return 'A cited source changed. Regenerate first.';
  }
  if ((a?.reviewReasons ?? []).length && !acknowledged) {
    return 'Check the flagged items and tick the box first.';
  }
  return null;
}

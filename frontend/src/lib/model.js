// Prototype rules (REQ §4.2, §7.6, §8, §9.3). Pure functions; see model.test.js.
import { FALLBACK, SCRIPTS, factsFor } from '../data/jarvis.js';

export const INGEST_STATUS = { ready: 'Ready', queued: 'Queued', processing: 'Processing', failed: 'Failed' };
export const INGEST_TONE = { ready: 'positive', queued: 'neutral', processing: 'alert', failed: 'negative' };

export const lastTurn = (c) => c.turns[c.turns.length - 1];
export const latestAnswer = (c) => c.answers[c.answers.length - 1] || null;
export const finalText = (a) => a.edited ?? a.text;

// §4.2: derived, never stored.
export function deriveState(c, generating = false) {
  if (generating) return 'generating';
  if (c.reviewed) return 'saved';
  const a = latestAnswer(c);
  if (!a || a.turnSeq !== lastTurn(c).seq) return 'failed';
  if (a.outcome === 'clarification_required') return 'awaiting_clarification';
  if (a.outcome === 'out_of_scope') return 'out_of_scope';
  if (a.reviewReasons.length) return 'needs_review';
  if (a.outcome === 'insufficient_evidence') return 'insufficient_evidence';
  return 'answer_ready';
}

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

// §7.6: why a cited passage is no longer current, or null.
export function citeStatus(cite, docs) {
  const d = docs.find((x) => x.id === cite.docId);
  if (!d) return 'Deleted';
  if (d.archived) return 'Archived';
  if (d.current !== cite.v) return 'Superseded';
  return null;
}
export const sourcesChanged = (cites, docs) => Object.values(cites).some((c) => citeStatus(c, docs));

// ANS-02: markers may be removed, never added.
export function validateEdit(text, answer) {
  if (!text.trim()) return 'The answer can\'t be empty.';
  for (const [m, f, n] of text.matchAll(/\[(F)?(\d+)\]/g)) {
    const known = f ? answer.facts.some((x) => x.id === `F${n}`) : !!answer.cites[n];
    if (!known) return `${m} doesn't match a citation in this answer. Markers can be removed but not added.`;
  }
  return null;
}

// ANS-03
export const stripMarkers = (text) => text.replace(/ ?\[F?\d+\]/g, '');

// ANS-04: the first rule that blocks saving, as a hint, or null.
export function saveBlockers({ conv, docs, generating = false, editing = false, acknowledged = false }) {
  const a = latestAnswer(conv);
  if (generating) return 'Wait for generation to finish.';
  if (conv.reviewed) return 'This conversation is already saved.';
  if (!a || a.turnSeq !== lastTurn(conv).seq) return 'The latest question has no answer. Retry first.';
  if (editing) return 'Save or cancel the edit first.';
  if (a.outcome === 'clarification_required') return 'Clarification requests can\'t be saved. Reply first.';
  if (a.outcome === 'out_of_scope') return 'Out-of-scope answers can\'t be saved.';
  if (!finalText(a).trim()) return 'The answer is empty.';
  if (sourcesChanged(a.cites, docs)) return 'A cited source changed. Regenerate first.';
  if (a.reviewReasons.length && !acknowledged) return 'Check the flagged items and tick the box first.';
  return null;
}

// Snapshot stored with a reviewed answer: only the markers left in the final text.
export function buildReviewed(conv, { reviewer, at, acknowledged }) {
  const a = latestAnswer(conv);
  const text = finalText(a);
  const used = new Set([...text.matchAll(/\[(F)?(\d+)\]/g)].map(([, f, n]) => (f ? `F${n}` : n)));
  return {
    answerId: a.id, text, reviewer, at, acknowledged,
    sources: Object.entries(a.cites).filter(([n]) => used.has(n)).map(([n, c]) => ({ n, ...c })),
    facts: a.facts.filter((f) => used.has(f.id)),
  };
}

// ---------- Simulated generation ----------

function passage(docs, key) {
  const [docId, k] = key.split(':');
  const d = docs.find((x) => x.id === docId && !x.archived && x.current);
  const ver = d?.versions.find((v) => v.v === d.current);
  const p = ver?.ps.find((x) => x.k === k);
  return p ? { docId, title: d.title, cat: d.cat, v: ver.v, eff: ver.eff, format: ver.format, ...p } : null;
}

// Script for the latest turn: a reply to a clarification first, then the account's scripts, else the labelled fallback.
export function pickScript(accountId, text, docs, prevAnswer) {
  const t = text.toLowerCase();
  const hit = (words) => words.some((w) => t.includes(w));
  if (prevAnswer?.outcome === 'clarification_required') {
    const s = SCRIPTS.find((x) => x.id === prevAnswer.scriptId);
    const r = s?.replies?.find((x) => hit(x.match));
    if (r) return r.script;
    if (s) return s; // essential information still missing: ask again
  }
  return SCRIPTS.find((s) => (s.account === '*' || s.account === accountId) && (!s.when || s.when(docs)) && hit(s.match)) || FALLBACK;
}

const MODEL_REASONS = ['policy_applicability', 'exception_unclear'];

// §9.3 normalisation. `replies` = clarification replies so far (rule 7: at most 2 rounds).
export function normalise(raw, { facts, docs, replies = 0 }) {
  const reasons = new Set((raw.reviewReasons || []).filter((r) => MODEL_REASONS.includes(r)));
  const factId = Object.fromEntries(facts.map((f) => [f.key, f.id]));
  const cites = {};
  const numByKey = {};
  const cite = (key) => {
    if (numByKey[key]) return numByKey[key];
    const p = passage(docs, key);
    if (!p) return null; // not retrievable (archived, deleted): the model would never have seen it
    const n = String(Object.keys(cites).length + 1);
    cites[n] = p;
    numByKey[key] = n;
    return n;
  };
  const resolve = (s = '') => s.replace(/ ?\[(F|S):([^\]]+)\]/g, (_, kind, key) => {
    const id = kind === 'F' ? factId[key] : cite(key);
    if (!id && kind === 'F') reasons.add('invalid_citation_removed');
    return id ? ` [${id}]` : '';
  });

  const text = resolve(raw.answer);
  let questions = (raw.questions || []).map(resolve);
  const conflicts = (raw.conflicts || [])
    .map((c) => ({ topic: c.topic, nums: c.sources.map(cite).filter(Boolean) })) // uncited conflict sources get the next numbers
    .filter((c) => c.nums.length > 1);
  const gaps = [...(raw.gaps || [])];
  let outcome = raw.outcome;

  if (conflicts.length) reasons.add('conflict');
  if (outcome === 'answer' && (!text.trim() || !/\[F?\d+\]/.test(text))) {
    outcome = 'insufficient_evidence';
    reasons.add('no_valid_citation');
  }
  let finalAnswer = text;
  if (outcome === 'clarification_required') {
    if (!questions.length) outcome = 'insufficient_evidence';
    else if (replies >= 2) {
      outcome = 'insufficient_evidence';
      gaps.push(...questions.map((q) => ({ kind: 'user_input', detail: stripMarkers(q) })));
      finalAnswer = 'Essential information is still missing after two clarification rounds, so this can\'t be answered from the available sources.';
      questions = [];
    } else questions = questions.slice(0, 2);
  }
  return { outcome, text: finalAnswer, questions, gaps, conflicts, reviewReasons: [...reasons], cites };
}

// One simulated generation for the conversation's latest turn.
export function simulateAnswer(conv, docs, account) {
  const turn = lastTurn(conv);
  const prev = [...conv.answers].reverse().find((a) => a.turnSeq < turn.seq);
  const replies = conv.turns.filter((t) => t.kind === 'clarification_reply').length;
  const { facts, empty } = factsFor(account);
  const raw = pickScript(conv.accountId, turn.text, docs, prev);
  return { turnSeq: turn.seq, scriptId: raw.id, fallback: !!raw.fallback, facts, empty, edited: null, ...normalise(raw, { facts, docs, replies }) };
}

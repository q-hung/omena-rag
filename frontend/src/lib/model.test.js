// Run: pnpm --filter frontend test
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { accountById, demoDocs } from '../data/jarvis.js';
import {
  buildReviewed, citeStatus, deriveState, saveBlockers, simulateAnswer, sourcesChanged, stripMarkers, validateEdit,
} from './model.js';

// Builds a conversation by asking, then replying, through the simulated generator.
function converse(accountId, texts, docs = demoDocs()) {
  const c = { id: 'c', accountId, turns: [], answers: [], reviewed: null };
  texts.forEach((text, i) => {
    c.turns.push({ seq: i + 1, kind: i ? 'clarification_reply' : 'question', text });
    c.answers.push({ id: i + 1, ...simulateAnswer(c, docs, accountById(accountId)) });
  });
  return c;
}
const last = (c) => c.answers[c.answers.length - 1];

test('S1: SSO answer cites the plan fact and SSO passages, numbered in order', () => {
  const a = last(converse(1, ['Why can\'t this account enable SSO?']));
  assert.equal(a.outcome, 'answer');
  assert.match(a.text, /\[F1\]/);
  assert.deepEqual(Object.values(a.cites).map((c) => `${c.docId}:${c.k}`), ['sso:a', 'plans:a', 'sso:b']);
  assert.equal(a.cites[1].page, 1);
});

test('conflict: both sources cited, review reason added', () => {
  const a = last(converse(3, ['How long until an approved refund arrives?']));
  assert.deepEqual(a.reviewReasons, ['conflict']);
  assert.deepEqual(a.conflicts[0].nums, ['1', '2']);
});

test('clarification: reply picks the payment; two unanswered rounds become insufficient evidence', () => {
  const asked = converse(3, ['Is this payment eligible for a refund?']);
  assert.equal(last(asked).outcome, 'clarification_required');
  assert.equal(last(asked).questions.length, 1);

  const answered = last(converse(3, ['Is this payment eligible for a refund?', 'the 600 GBP one']));
  assert.equal(answered.outcome, 'answer');
  assert.deepEqual(answered.reviewReasons, ['exception_unclear']);

  const c = converse(3, ['Is this payment eligible for a refund?', 'not sure', 'still not sure']);
  assert.equal(c.answers[1].outcome, 'clarification_required');
  assert.equal(last(c).outcome, 'insufficient_evidence');
  assert.equal(last(c).gaps[0].kind, 'user_input');
});

test('S6: after v3 the refund answer cites v3 and flags policy applicability', () => {
  const docs = demoDocs();
  const r = docs.find((d) => d.id === 'refund');
  r.versions.unshift(r.pending);
  r.current = 3;
  const a = last(converse(2, ['Is this payment eligible for a refund?'], docs));
  assert.equal(a.cites[1].v, 3);
  assert.deepEqual(a.reviewReasons, ['policy_applicability']);
});

test('out of scope and unscripted questions', () => {
  assert.equal(last(converse(4, ['Why won\'t my motorcycle start?'])).outcome, 'out_of_scope');
  const f = last(converse(4, ['What colour is the logo?']));
  assert.equal(f.outcome, 'insufficient_evidence');
  assert.ok(f.fallback);
});

test('staleness: archive, restore, delete, supersede', () => {
  const docs = demoDocs();
  const a = last(converse(1, ['Why can\'t this account enable SSO?'], docs));
  const sso = docs.find((d) => d.id === 'sso');
  assert.equal(sourcesChanged(a.cites, docs), false);
  sso.archived = true;
  assert.equal(citeStatus(a.cites[1], docs), 'Archived');
  sso.archived = false;
  assert.equal(sourcesChanged(a.cites, docs), false);
  docs.find((d) => d.id === 'plans').current = 4;
  assert.equal(citeStatus(a.cites[2], docs), 'Superseded');
  assert.equal(citeStatus(a.cites[1], docs.filter((d) => d.id !== 'sso')), 'Deleted');
});

test('edit validation and copy', () => {
  const a = last(converse(1, ['Why can\'t this account enable SSO?']));
  assert.match(validateEdit('Foo [7].', a), /\[7\]/);
  assert.match(validateEdit('Foo [F99].', a), /\[F99\]/);
  assert.equal(validateEdit('Foo [1] bar.', a), null);
  assert.equal(validateEdit('  ', a), 'The answer can\'t be empty.');
  assert.equal(stripMarkers('Basic plan [F1], locked [1][2].'), 'Basic plan, locked.');
  assert.ok(!stripMarkers(a.text).includes('['));
});

test('save rules and the reviewed snapshot', () => {
  const docs = demoDocs();
  assert.match(saveBlockers({ conv: converse(3, ['Is this payment eligible for a refund?'], docs), docs }), /Clarification/);
  assert.match(saveBlockers({ conv: converse(1, ['motorcycle'], docs), docs }), /Out-of-scope/);

  const conflict = converse(3, ['How long until an approved refund arrives?'], docs);
  assert.match(saveBlockers({ conv: conflict, docs }), /tick the box/);
  assert.equal(saveBlockers({ conv: conflict, docs, acknowledged: true }), null);

  const sso = converse(1, ['Why can\'t this account enable SSO?'], docs);
  docs.find((d) => d.id === 'sso').archived = true;
  assert.match(saveBlockers({ conv: sso, docs }), /source changed/);

  sso.answers[0].edited = 'Basic plan [F1]. Enterprise only [1].';
  const r = buildReviewed(sso, { reviewer: 'x', at: 'now', acknowledged: false });
  assert.deepEqual(r.sources.map((s) => s.n), ['1']);
  assert.deepEqual(r.facts.map((f) => f.id), ['F1']);
});

test('derived state', () => {
  const c = converse(1, ['Why can\'t this account enable SSO?']);
  assert.equal(deriveState(c), 'answer_ready');
  assert.equal(deriveState(c, true), 'generating');
  c.turns.push({ seq: 2, kind: 'clarification_reply', text: 'x' });
  assert.equal(deriveState(c), 'failed');
  assert.equal(deriveState(converse(3, ['refund?'])), 'awaiting_clarification');
  assert.equal(deriveState(converse(3, ['How long until an approved refund arrives?'])), 'needs_review');
  assert.equal(deriveState(converse(5, ['Brazil?'])), 'insufficient_evidence');
  assert.equal(deriveState({ ...c, reviewed: {} }), 'saved');
});

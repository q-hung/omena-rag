import { test } from 'vitest';
import assert from 'node:assert/strict';
import { citesOf, EVIDENCE_LABEL } from './rfp.js';

test('citesOf keeps only cited sources, keyed by marker number', () => {
  const cites = citesOf({
    sources: [
      { rank: 1, citationNumber: null, title: 'A', documentId: 1 },
      { rank: 2, citationNumber: 1, title: 'SSO guide', heading: 'Setup', pageNumber: 2, documentId: 7 },
    ],
  });
  assert.deepEqual(Object.keys(cites), ['1']);
  assert.equal(cites[1].documentId, 7);
  assert.equal(cites[1].page, 2);
});

test('citesOf handles no answer', () => {
  assert.deepEqual(citesOf(null), {});
});

test('evidence labels carry no numbers or "verified" (ANS-07)', () => {
  for (const label of Object.values(EVIDENCE_LABEL)) {
    assert.doesNotMatch(label, /\d|%|verified|confidence/i);
  }
});

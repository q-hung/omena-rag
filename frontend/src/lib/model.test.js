import { test } from 'vitest';
import assert from 'node:assert/strict';
import { finalText, saveHint, stripMarkers } from './model.js';

test('copy strips citation markers', () => {
  assert.equal(stripMarkers('Basic plan [F1], locked [1][2].'), 'Basic plan, locked.');
  assert.ok(!stripMarkers('The account is on Pro [F1] [1].').includes('['));
});

test('save hint covers the common blocks', () => {
  assert.match(saveHint({ state: 'awaiting_clarification', answers: [] }), /Clarification/);
  assert.match(saveHint({ state: 'out_of_scope', answers: [{ text: 'x', reviewReasons: [] }] }), /Out-of-scope/);
  assert.equal(finalText({ text: 'a', edited: 'b' }), 'b');
});

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChunkBody from './ChunkBody.jsx';

const html = (format, text) => renderToStaticMarkup(createElement(ChunkBody, { format, text }));

test('markdown renders lists, tables, code and bold', () => {
  const out = html(
    'md',
    [
      '- **Read only** — customers.',
      '',
      '| Plan | Requests per minute |',
      '|---|---|',
      '| Pro | 100 |',
      '',
      '```',
      'Authorization: Bearer sp_live_...',
      '```',
    ].join('\n'),
  );
  assert.match(out, /<strong>Read only<\/strong>/);
  assert.match(out, /<ul>/);
  assert.match(out, /<table>/);
  assert.match(out, /<th[^>]*>Plan<\/th>/);
  assert.match(out, /<pre>/);
  assert.match(out, /Authorization: Bearer/);
  assert.ok(!out.includes('**Read only**'));
});

test('markdown shows raw HTML as text, not an element', () => {
  const out = html('md', '<script>alert(1)</script>');
  assert.ok(!/<script[\s>]/i.test(out));
  assert.match(out, /alert\(1\)|&lt;script&gt;/);
});

test('PDF chunks stay plain text with line breaks', () => {
  const out = html('pdf', '**bold**\n- list');
  assert.match(out, /<p class="whitespace-pre-line/);
  assert.match(out, /\*\*bold\*\*/);
  assert.ok(!out.includes('<strong>'));
  assert.ok(!out.includes('<ul>'));
});

import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { formatDocumentForEmbedding, formatQueryForEmbedding } from '../src/llm/format.ts';
import { geminiProvider, type GeminiModels } from '../src/llm/gemini.ts';
import { createProvider } from '../src/llm/provider.ts';
import { embedText, stubProvider } from '../src/llm/stub.ts';

const deadline = () => Date.now() + 15_000;
const cfg = loadConfig({
  DATABASE_URL: 'postgres://jarvis:jarvis@localhost:5433/jarvis_test',
  LLM_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'test-key',
});

const valid = {
  outcome: 'answer' as const,
  answer: 'The account is on the Pro plan [F1].',
};

function fake(generate: GeminiModels['generateContent'], embed?: GeminiModels['embedContent']): GeminiModels {
  return {
    generateContent: generate,
    embedContent:
      embed ??
      (async ({ contents }) => ({
        embeddings: contents.map(() => ({ values: Array.from({ length: 768 }, () => 0.01) })),
      })),
  };
}

function http(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe('embedding text formats', () => {
  it('uses the embedding-2 document and query prefixes', () => {
    expect(formatDocumentForEmbedding({ title: 'Refund policy', text: '30 days' })).toBe(
      'title: Refund policy | text: 30 days',
    );
    expect(formatDocumentForEmbedding({ text: 'no title' })).toBe('title: none | text: no title');
    expect(formatQueryForEmbedding('why is the webhook failing?')).toBe(
      'task: search result | query: why is the webhook failing?',
    );
  });
});

describe('stub provider', () => {
  const stub = stubProvider();

  it('returns deterministic 768-d embeddings of the formatted text', async () => {
    const q = 'why is the webhook failing?';
    const once = await stub.embedQuery(q, deadline());
    const twice = await stub.embedQuery(q, deadline());
    expect(once.vectors[0]).toHaveLength(768);
    expect(once.vectors[0]).toEqual(twice.vectors[0]);
    expect(once.vectors[0]).toEqual(embedText(formatQueryForEmbedding(q)));
    expect(once.vectors[0]).not.toEqual(embedText(q));
  });

  it('embeds each document chunk separately', async () => {
    const { vectors } = await stub.embedDocuments(
      [
        { title: 'A', text: 'one' },
        { title: 'B', text: 'two' },
      ],
      deadline(),
    );
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).not.toEqual(vectors[1]);
  });

  it('returns a scripted §7.4 result and a labelled fallback', async () => {
    const scripted = await stub.generate({ prompt: 'x', question: 'motorcycle start', accountId: 1 }, deadline());
    expect(scripted.output.outcome).toBe('out_of_scope');
    expect(scripted.model).toBe('stub:E11');

    const fallback = await stub.generate({ prompt: 'unscripted' }, deadline());
    expect(fallback.output.outcome).toBe('insufficient_evidence');
    expect(fallback.output.answer).toMatch(/^Simulated:/);
  });
});

describe('gemini provider', () => {
  it('retries 500 then 500 then 200 for three attempts', async () => {
    let attempts = 0;
    const models = fake(async () => {
      attempts += 1;
      if (attempts < 3) throw http(500);
      return { text: JSON.stringify(valid), candidates: [{ finishReason: 'STOP' }] };
    });
    const result = await geminiProvider(cfg, models).generate({ prompt: 'q' }, deadline());
    expect(attempts).toBe(3);
    expect(result.output.outcome).toBe('answer');
  });

  it('does not retry a 400', async () => {
    let attempts = 0;
    const models = fake(async () => {
      attempts += 1;
      throw http(400);
    });
    await expect(geminiProvider(cfg, models).generate({ prompt: 'q' }, deadline())).rejects.toMatchObject({
      code: 'HTTP_400',
    });
    expect(attempts).toBe(1);
  });

  it('throws on a truncated response', async () => {
    const models = fake(async () => ({
      text: '{"outcome":"answer","answer":"',
      candidates: [{ finishReason: 'MAX_TOKENS' }],
    }));
    await expect(geminiProvider(cfg, models).generate({ prompt: 'q' }, deadline())).rejects.toMatchObject({
      code: 'TRUNCATED',
    });
  });

  it('throws on malformed JSON', async () => {
    const models = fake(async () => ({ text: '{not-json', candidates: [{ finishReason: 'STOP' }] }));
    await expect(geminiProvider(cfg, models).generate({ prompt: 'q' }, deadline())).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    });
  });

  it('throws when JSON fails the §7.4 schema', async () => {
    const models = fake(async () => ({
      text: JSON.stringify({ outcome: 'maybe', answer: '' }),
      candidates: [{ finishReason: 'STOP' }],
    }));
    await expect(geminiProvider(cfg, models).generate({ prompt: 'q' }, deadline())).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    });
  });

  it('does not start a retry after the deadline when the first attempt hangs', async () => {
    let attempts = 0;
    const models = fake(() => {
      attempts += 1;
      return new Promise(() => {});
    });
    await expect(geminiProvider(cfg, models).generate({ prompt: 'q' }, Date.now() + 1_000)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(attempts).toBe(1);
  });

  it('sends one Content object per document chunk', async () => {
    let sent: unknown;
    const models = fake(
      async () => ({ text: JSON.stringify(valid) }),
      async (params) => {
        sent = params.contents;
        return { embeddings: params.contents.map(() => ({ values: Array.from({ length: 768 }, () => 0) })) };
      },
    );
    await geminiProvider(cfg, models).embedDocuments([{ title: 'A', text: 'one' }, { text: 'two' }], deadline());
    expect(sent).toEqual([
      { role: 'user', parts: [{ text: 'title: A | text: one' }] },
      { role: 'user', parts: [{ text: 'title: none | text: two' }] },
    ]);
  });
});

describe('LLM_DEBUG_DIR', () => {
  it('writes the raw prompt, request config and response of each attempt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'llm-debug-'));
    const debugCfg = { ...cfg, LLM_DEBUG_DIR: dir };
    let attempts = 0;
    const models = fake(async () => {
      attempts += 1;
      if (attempts === 1) throw http(500);
      return { text: JSON.stringify(valid), candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 7 } };
    });
    await geminiProvider(debugCfg, models).generate({ prompt: 'the prompt' }, deadline());
    await geminiProvider(debugCfg, models).embedQuery('q', deadline());

    const entries = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
    const generates = entries.filter((e) => e.kind === 'generate');
    expect(generates).toHaveLength(2);
    expect(generates.find((e) => e.error)?.error).toBe('HTTP 500');
    const ok = generates.find((e) => e.response)!;
    expect(ok.request.contents).toBe('the prompt');
    expect(ok.request.config.responseJsonSchema).toBeDefined();
    expect(ok.request.config.abortSignal).toBeUndefined();
    expect(ok.response).toMatchObject({ text: JSON.stringify(valid), finishReason: 'STOP', usage: { promptTokenCount: 7 } });
    const embed = entries.find((e) => e.kind === 'embed')!;
    expect(embed.request.contents[0].parts[0].text).toBe(formatQueryForEmbedding('q'));
    expect(embed.response[0]).toMatchObject({ dims: 768 });
    expect(embed.response[0].head).toHaveLength(8);
  });

  it('is refused when COOKIE_SECURE=true', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: cfg.DATABASE_URL, COOKIE_SECURE: 'true', LLM_DEBUG_DIR: '.llm-debug' }),
    ).toThrow(/LLM_DEBUG_DIR/);
  });
});

describe('createProvider', () => {
  it('uses the stub when LLM_PROVIDER=stub', async () => {
    const p = createProvider(loadConfig({ DATABASE_URL: cfg.DATABASE_URL, LLM_PROVIDER: 'stub' }));
    const { vectors } = await p.embedQuery('ping', deadline());
    expect(vectors[0]).toHaveLength(768);
  });
});

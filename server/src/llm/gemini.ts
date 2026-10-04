import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { Config } from '../config.ts';
import { ProviderError, statusOf } from './errors.ts';
import { formatDocumentForEmbedding, formatQueryForEmbedding } from './format.ts';
import { withRetries } from './retry.ts';
import { modelOutputJsonSchema, modelOutputSchema } from './schema.ts';
import type { EmbedResult, GenerateInput, GenerateResult, Provider } from './types.ts';

export const GENERATE_TIMEOUT_MS = 20_000;
export const EMBED_QUERY_TIMEOUT_MS = 10_000;
export const EMBED_DOCS_TIMEOUT_MS = 20_000;
export const MAX_OUTPUT_TOKENS = 2_048;

export type GeminiModels = {
  embedContent: (params: {
    model: string;
    contents: { role: string; parts: { text: string }[] }[];
    config?: Record<string, unknown>;
  }) => Promise<{ embeddings?: { values?: number[] }[] }>;
  generateContent: (params: {
    model: string;
    contents: string;
    config?: Record<string, unknown>;
  }) => Promise<{
    text?: string;
    candidates?: { finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  }>;
};

export function geminiModels(config: Config): GeminiModels {
  return new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }).models as unknown as GeminiModels;
}

export function geminiProvider(config: Config, models: GeminiModels = geminiModels(config)): Provider {
  if (config.LLM_DEBUG_DIR) models = withDebugLog(models, config.LLM_DEBUG_DIR);
  const noSdkRetry = { attempts: 1 };

  const embed = async (texts: string[], timeoutMs: number, deadline: number): Promise<EmbedResult> => {
    const response = await withRetries(
      (signal) =>
        models.embedContent({
          model: config.EMBEDDING_MODEL,
          contents: texts.map((text) => ({ role: 'user', parts: [{ text }] })),
          config: {
            outputDimensionality: config.EMBEDDING_DIMENSIONS,
            abortSignal: signal,
            httpOptions: { timeout: timeoutMs, retryOptions: noSdkRetry },
          },
        }),
      { timeoutMs, deadline },
    ).catch((error) => {
      throw wrap(error);
    });

    const vectors = (response.embeddings ?? []).map((e) => e.values ?? []);
    if (vectors.length !== texts.length || vectors.some((v) => v.length !== config.EMBEDDING_DIMENSIONS)) {
      throw new ProviderError('INVALID_OUTPUT', 'Embedding response was incomplete.');
    }
    return { vectors };
  };

  return {
    embedDocuments: (chunks, deadline) =>
      embed(chunks.map(formatDocumentForEmbedding), EMBED_DOCS_TIMEOUT_MS, deadline),

    embedQuery: (query, deadline) =>
      embed([formatQueryForEmbedding(query)], EMBED_QUERY_TIMEOUT_MS, deadline),

    async generate(input: GenerateInput, deadline: number): Promise<GenerateResult> {
      const response = await withRetries(
        (signal) =>
          models.generateContent({
            model: config.GENERATION_MODEL,
            contents: input.prompt,
            config: {
              abortSignal: signal,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              responseMimeType: 'application/json',
              responseJsonSchema: modelOutputJsonSchema,
              thinkingConfig: { thinkingBudget: 0 },
              httpOptions: { timeout: GENERATE_TIMEOUT_MS, retryOptions: noSdkRetry },
            },
          }),
        { timeoutMs: GENERATE_TIMEOUT_MS, deadline, maxRetries: input.once ? 0 : undefined },
      ).catch((error) => {
        throw wrap(error);
      });

      if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new ProviderError('TRUNCATED', 'The model response was cut off by the token limit.');
      }
      const text = response.text;
      if (!text) throw new ProviderError('INVALID_OUTPUT', 'The model returned an empty response.');
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch (error) {
        throw new ProviderError('INVALID_OUTPUT', 'The model returned malformed JSON.', false, { cause: error });
      }
      const parsed = modelOutputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ProviderError('INVALID_OUTPUT', 'The model returned JSON that failed the §7.4 schema.');
      }
      return {
        output: parsed.data,
        model: config.GENERATION_MODEL,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount,
          outputTokens: response.usageMetadata?.candidatesTokenCount,
        },
      };
    },
  };
}

// SEC-11 exception, local development only: one JSON file per raw SDK call (every attempt),
// never the app log or the database.
export function withDebugLog(models: GeminiModels, dir: string): GeminiModels {
  mkdirSync(dir, { recursive: true });
  const record = async <T>(
    kind: string,
    params: { config?: Record<string, unknown> },
    call: () => Promise<T>,
    view: (response: T) => unknown,
  ): Promise<T> => {
    const { abortSignal: _signal, httpOptions: _http, ...sent } = params.config ?? {};
    const entry: Record<string, unknown> = { at: new Date().toISOString(), kind, request: { ...params, config: sent } };
    const started = Date.now();
    try {
      const response = await call();
      entry.response = view(response);
      return response;
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      entry.ms = Date.now() - started;
      const name = `${String(entry.at).replace(/[:.]/g, '-')}-${kind}-${randomUUID().slice(0, 8)}.json`;
      writeFileSync(join(dir, name), JSON.stringify(entry, null, 2));
    }
  };
  return {
    generateContent: (params) =>
      record('generate', params, () => models.generateContent(params), (r) => ({
        text: r.text,
        finishReason: r.candidates?.[0]?.finishReason,
        usage: r.usageMetadata,
      })),
    // ponytail: vectors are cut to their first 8 values; the full 768 add nothing to read.
    embedContent: (params) =>
      record('embed', params, () => models.embedContent(params), (r) =>
        r.embeddings?.map((e) => ({ dims: e.values?.length, head: e.values?.slice(0, 8) })),
      ),
  };
}

function wrap(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const status = statusOf(error);
  const retryable = status === 429 || (status !== undefined && status >= 500);
  return new ProviderError(
    status ? `HTTP_${status}` : 'PROVIDER',
    error instanceof Error ? error.message : 'Provider call failed.',
    retryable,
    { cause: error instanceof Error ? error : undefined },
  );
}

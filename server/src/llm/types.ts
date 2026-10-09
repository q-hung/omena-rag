import type { ZodType } from 'zod';
import type { CallKind } from './budget.ts';
import type { ModelOutput } from './schema.ts';

export type EmbedChunk = { title?: string; text: string };

export type GenerateInput = {
  prompt: string;
  question?: string;
  accountId?: number;
  previousScriptId?: string;
  refundV3?: boolean;
  once?: boolean;
};

export type EmbedResult = { vectors: number[][] };

export type Usage = { inputTokens?: number; outputTokens?: number };

export type GenerateResult = {
  output: ModelOutput;
  model: string;
  usage?: Usage;
};

// REQ_V3 §7.4: one schema-parameterised call. `stubKind` lets the stub pick a
// deterministic shape without seeing the zod type.
export type StructuredInput<T> = {
  prompt: string;
  schema: ZodType<T>;
  jsonSchema: object;
  kind: CallKind;
  stubKind?: 'rfp';
  once?: boolean;
};

export type StructuredResult<T> = {
  output: T;
  model: string;
  usage?: Usage;
};

export type Provider = {
  embedDocuments: (chunks: EmbedChunk[], deadline: number) => Promise<EmbedResult>;
  embedQuery: (query: string, deadline: number) => Promise<EmbedResult>;
  generate: (input: GenerateInput, deadline: number) => Promise<GenerateResult>;
  generateStructured: <T>(input: StructuredInput<T>, deadline: number) => Promise<StructuredResult<T>>;
};

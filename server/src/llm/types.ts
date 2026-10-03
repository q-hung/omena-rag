import type { ModelOutput } from './schema.ts';

export type EmbedChunk = { title?: string; text: string };

export type GenerateInput = {
  prompt: string;
  question?: string;
  accountId?: number;
  previousScriptId?: string;
  refundV3?: boolean;
};

export type EmbedResult = { vectors: number[][] };

export type GenerateResult = {
  output: ModelOutput;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export type Provider = {
  embedDocuments: (chunks: EmbedChunk[], deadline: number) => Promise<EmbedResult>;
  embedQuery: (query: string, deadline: number) => Promise<EmbedResult>;
  generate: (input: GenerateInput, deadline: number) => Promise<GenerateResult>;
};

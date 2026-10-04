import type { Config } from '../config/config.ts';
import { geminiProvider } from './gemini.ts';
import { stubProvider } from './stub.ts';
import type { Provider } from './types.ts';

export { formatDocumentForEmbedding, formatQueryForEmbedding } from './format.ts';
export { ProviderError } from './errors.ts';
export { modelOutputSchema, type ModelOutput } from './schema.ts';
export type { EmbedChunk, EmbedResult, GenerateInput, GenerateResult, Provider } from './types.ts';

export function createProvider(config: Config): Provider {
  return config.LLM_PROVIDER === 'gemini' ? geminiProvider(config) : stubProvider();
}

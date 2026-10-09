import { FALLBACK, pickScript } from '../../fixtures/scripts.ts';
import { ProviderError } from './errors.ts';
import { formatDocumentForEmbedding, formatQueryForEmbedding } from './format.ts';
import { modelOutputSchema } from './schema.ts';
import type {
  EmbedChunk,
  GenerateInput,
  GenerateResult,
  Provider,
  StructuredInput,
  StructuredResult,
} from './types.ts';

const DIM = 768;

function guard(deadline: number) {
  if (Date.now() >= deadline) {
    throw new ProviderError('DEADLINE', 'The request deadline passed before a new attempt could start.');
  }
}

export function stubProvider(): Provider {
  return {
    embedDocuments: async (chunks: EmbedChunk[], deadline) => {
      guard(deadline);
      return { vectors: chunks.map((c) => embedText(formatDocumentForEmbedding(c))) };
    },
    embedQuery: async (query: string, deadline) => {
      guard(deadline);
      return { vectors: [embedText(formatQueryForEmbedding(query))] };
    },
    async generate(input: GenerateInput, deadline): Promise<GenerateResult> {
      guard(deadline);
      const script = pickScript(input.question ?? input.prompt, input.accountId, {
        previousScriptId: input.previousScriptId,
        refundV3: input.refundV3,
      });
      return {
        output: modelOutputSchema.parse({
          outcome: script.outcome,
          answer: script.answer,
          clarifications: script.clarifications,
          gaps: script.gaps,
          conflicts: script.conflicts,
          review_reasons: script.review_reasons,
        }),
        model: script.id === FALLBACK.id ? 'stub-fallback' : `stub:${script.id}`,
      };
    },
    async generateStructured<T>(input: StructuredInput<T>, deadline: number): Promise<StructuredResult<T>> {
      guard(deadline);
      if (input.stubKind === 'rfp') {
        return { output: input.schema.parse(rfpStub(input.prompt)), model: 'stub:rfp' };
      }
      // Default: run the Ask stub through the provided schema.
      const result = await this.generate({ prompt: input.prompt }, deadline);
      return { output: input.schema.parse(result.output), model: result.model, usage: result.usage };
    },
  };
}

// REQ_V3 §7.4 stub: deterministic. With passages (prompt contains S1 marker),
// HIGH_EVIDENCE citing the first sentence of S1; otherwise INSUFFICIENT.
function rfpStub(prompt: string): { evidence_status: string; answer: string; gaps: string[] } {
  const match = prompt.match(/\nS1 \|[^\n]*\n([^\n]+)/);
  if (!match) {
    return {
      evidence_status: 'INSUFFICIENT_EVIDENCE',
      answer: "The knowledge base doesn't contain enough evidence to answer this safely.",
      gaps: [],
    };
  }
  const firstSentence = match[1]!.split(/(?<=[.!?])\s/)[0]!.trim();
  return {
    evidence_status: 'HIGH_EVIDENCE',
    answer: `Simulated: ${firstSentence} [S1]`,
    gaps: [],
  };
}

/** Deterministic 768-d unit vector from token overlap, so stub retrieval can hit. */
export function embedText(text: string): number[] {
  const values = new Array<number>(DIM).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    values[(hash >>> 0) % DIM]! += 1;
  }
  let norm = 0;
  for (const n of values) {
    norm += n * n;
  }
  norm = Math.sqrt(norm) || 1;
  return values.map((n) => n / norm);
}

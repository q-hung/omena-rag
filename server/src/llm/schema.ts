import { z } from 'zod';

// REQ §7.4 structured output. Extra model keys are dropped.
const chooseRecord = z.object({
  kind: z.literal('choose_record'),
  prompt: z.string(),
  options: z.array(z.string()).min(1),
});

const freeText = z.object({
  kind: z.literal('free_text'),
  question: z.string(),
});

export const modelOutputSchema = z.object({
  outcome: z.enum(['answer', 'clarification_required', 'insufficient_evidence', 'out_of_scope']),
  answer: z.string(),
  clarifications: z.array(z.discriminatedUnion('kind', [chooseRecord, freeText])).max(2).default([]),
  gaps: z
    .array(z.object({ kind: z.enum(['no_record', 'documentation', 'user_input']), detail: z.string() }))
    .default([]),
  conflicts: z.array(z.object({ topic: z.string(), sources: z.array(z.string()) })).default([]),
  review_reasons: z.array(z.enum(['policy_applicability', 'exception_unclear'])).default([]),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;
export const modelOutputJsonSchema = z.toJSONSchema(modelOutputSchema);

import { z } from 'zod';

// REQ_V3 §7.4 structured output for RFP answers. The model proposes evidence_status;
// the server can only lower it (REQ_V3 §8). Extra model keys are dropped.
export const rfpAnswerSchema = z.object({
  evidence_status: z.enum(['HIGH_EVIDENCE', 'PARTIAL_EVIDENCE', 'INSUFFICIENT_EVIDENCE']),
  answer: z.string(),
  gaps: z.array(z.string()).default([]),
});

export type RfpAnswerOutput = z.infer<typeof rfpAnswerSchema>;
export const rfpAnswerJsonSchema = z.toJSONSchema(rfpAnswerSchema);

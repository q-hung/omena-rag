import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config/config.ts';
import { db } from '../db/index.ts';
import { rowsOf } from '../db/rows.ts';
import { EVIDENCE_STATUSES, rfpAnswers, rfpQuestions } from '../db/schema.ts';
import { AppError, conflict, notFound } from '../errors.ts';
import { paidAttempt, type CallPurpose } from '../llm/budget.ts';
import { ProviderError, isRetryable } from '../llm/errors.ts';
import { formatQueryForEmbedding } from '../llm/format.ts';
import { createProvider } from '../llm/provider.ts';
import { rfpAnswerJsonSchema, rfpAnswerSchema, type RfpAnswerOutput } from '../llm/rfp-schema.ts';
import { MAX_RETRIES } from '../llm/retry.ts';
import type { Provider } from '../llm/types.ts';
import { normalise } from '../rag/normalise.ts';
import { retrieve, type Passage } from '../rag/retrieve.ts';
import { buildRfpPrompt, RFP_PROMPT_VERSION } from '../rag/rfp-prompt.ts';
import { REQUEST_DEADLINE_MS, requireOwner } from './generate.service.ts';

// REQ_V3 §8. The model proposes a status; the server can only lower it.
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

const RANK: Record<EvidenceStatus, number> = {
  INSUFFICIENT_EVIDENCE: 0,
  PARTIAL_EVIDENCE: 1,
  HIGH_EVIDENCE: 2,
};

const INSUFFICIENT_TEXT = "The knowledge base doesn't contain enough evidence to answer this safely.";

export type EvidenceInput = {
  modelStatus: EvidenceStatus;
  passageCount: number;
  invalidCitationRemoved: boolean;
  validCitationCount: number;
  gaps: string[];
};

export function applyEvidenceRules(input: EvidenceInput): { evidenceStatus: EvidenceStatus; reviewReasons: string[] } {
  if (input.passageCount === 0) {
    return { evidenceStatus: 'INSUFFICIENT_EVIDENCE', reviewReasons: [] };
  }
  let status = input.modelStatus;
  const reviewReasons: string[] = [];
  const lower = (cap: EvidenceStatus) => {
    if (RANK[status] > RANK[cap]) {
      status = cap;
    }
  };
  if (input.invalidCitationRemoved) {
    reviewReasons.push('invalid_citation_removed');
    lower('PARTIAL_EVIDENCE');
  }
  if (input.validCitationCount === 0 && status !== 'INSUFFICIENT_EVIDENCE') {
    reviewReasons.push('no_valid_citation');
    lower('INSUFFICIENT_EVIDENCE');
  }
  if (input.modelStatus === 'INSUFFICIENT_EVIDENCE') {
    return { evidenceStatus: 'INSUFFICIENT_EVIDENCE', reviewReasons };
  }
  if (input.gaps.length > 0 && input.modelStatus === 'HIGH_EVIDENCE' && status !== 'INSUFFICIENT_EVIDENCE') {
    reviewReasons.push('gaps_reported');
    lower('PARTIAL_EVIDENCE');
  }
  return { evidenceStatus: status, reviewReasons };
}

export type RfpAnswerDeps = {
  provider?: Provider;
  retrieve?: typeof retrieve;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const PURPOSE: CallPurpose = 'app';

export async function regenerateQuestion(input: {
  questionId: number;
  employeeId: number;
  config: Config;
  deps?: RfpAnswerDeps;
  log?: FastifyBaseLogger;
}): Promise<number> {
  const token = randomUUID();
  const started = await db().transaction(async (tx) => {
    const [row] = rowsOf(
      await tx.execute(sql`
        select q.status, q.generation_started_at, r.created_by, r.id as rfp_id, r.status as rfp_status,
          case
            when q.status = 'queued' then 1
            when q.status = 'processing'
              and (q.generation_started_at is null or q.generation_started_at > now() - interval '2 minutes')
              then 1
            else 0
          end as busy
        from rfp_questions q
        join rfps r on r.id = q.rfp_id
        where q.id = ${input.questionId}
        for update of q
      `),
    );
    if (!row) {
      throw notFound('QUESTION_NOT_FOUND', 'No such question.');
    }
    requireOwner({ createdBy: Number(row.created_by) }, input.employeeId);
    if (row.rfp_status !== 'confirmed') {
      throw conflict('RFP_NOT_CONFIRMED', 'Confirm the questions before generating answers.');
    }
    if (Number(row.busy) === 1) {
      throw conflict('GENERATION_IN_PROGRESS', 'This question is already being answered.');
    }
    if (!rowsOf(await takeQuestionLock(tx, input.questionId, token)).length) {
      throw conflict('GENERATION_IN_PROGRESS', 'This question is already being answered.');
    }
    return { rfpId: Number(row.rfp_id), token };
  });

  try {
    await answerQuestion(input.questionId, started.token, {
      ...input.deps,
      config: input.config,
      employeeId: input.employeeId,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === 'LOCK_TAKEN') {
      throw error;
    }
    if (!(error instanceof AppError) && !(error instanceof ProviderError)) {
      const err = error as Error;
      input.log?.error(
        { code: 'ERROR', questionId: input.questionId, err: err?.message, stack: err?.stack },
        'rfp answer failed unexpectedly',
      );
    }
    await failQuestion(input.questionId, started.token, error);
    if (error instanceof AppError) {
      throw error;
    }
  }
  return started.rfpId;
}

export async function takeQuestionLock(
  tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
  id: number,
  token: string,
) {
  return tx.execute(sql`
    update rfp_questions
    set status = 'processing',
        generation_token = ${token}::uuid,
        generation_started_at = now(),
        attempts = attempts + 1,
        error_code = null
    where id = ${id}
      and (generation_token is null or generation_started_at < now() - interval '2 minutes')
    returning id
  `);
}

export async function answerQuestion(
  questionId: number,
  token: string,
  deps: RfpAnswerDeps & { config: Config; employeeId: number },
): Promise<void> {
  const cfg = deps.config;
  const now = deps.now ?? Date.now;
  const deadline = now() + REQUEST_DEADLINE_MS;
  const provider = deps.provider ?? createProvider(cfg);
  const search = deps.retrieve ?? retrieve;

  const [question] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, questionId));
  if (!question) {
    throw notFound('QUESTION_NOT_FOUND', 'No such question.');
  }
  const query = [question.section, question.text].filter((part) => part && part.trim()).join('\n');
  if (now() >= deadline) {
    throw new ProviderError('DEADLINE', 'The request deadline passed before a new attempt could start.');
  }
  const formatted = formatQueryForEmbedding(query);
  const vector = await paidAttempt(
    {
      kind: 'embed_query',
      purpose: PURPOSE,
      attempt: 1,
      model: cfg.EMBEDDING_MODEL,
      inputChars: formatted.length,
      employeeId: deps.employeeId,
      rfpQuestionId: questionId,
    },
    async () => {
      const result = await provider.embedQuery(query, deadline);
      return { value: result.vectors[0]!, usage: undefined };
    },
    cfg,
  );
  const passages = await search(vector, {
    model: cfg.EMBEDDING_MODEL,
    minScore: cfg.LLM_PROVIDER === 'stub' ? 0 : cfg.RETRIEVAL_MIN_SCORE,
    lexicalQuery: cfg.LLM_PROVIDER === 'stub' ? query : undefined,
    mode: cfg.RETRIEVAL_MODE,
    queryText: query,
  });

  if (passages.length === 0) {
    const ruled = applyEvidenceRules({
      modelStatus: 'INSUFFICIENT_EVIDENCE',
      passageCount: 0,
      invalidCitationRemoved: false,
      validCitationCount: 0,
      gaps: [],
    });
    await saveAnswer({
      questionId,
      token,
      text: INSUFFICIENT_TEXT,
      gaps: [],
      modelEvidenceStatus: 'INSUFFICIENT_EVIDENCE',
      evidenceStatus: ruled.evidenceStatus,
      reviewReasons: ruled.reviewReasons,
      model: 'none',
      promptVersion: 'none',
      retrievalMode: cfg.RETRIEVAL_MODE,
      passages: [],
      cited: new Map(),
    });
    return;
  }

  const built = buildRfpPrompt({ question: question.text, section: question.section, passages });
  const generated = await paidRfpGenerate(provider, built.prompt, deadline, deps, questionId, cfg);
  const normalised = normalise(
    {
      outcome: 'answer',
      answer: generated.output.answer,
      clarifications: [],
      gaps: [],
      conflicts: [],
      review_reasons: [],
    },
    { facts: [], passages: built.passages },
  );
  const ruled = applyEvidenceRules({
    modelStatus: generated.output.evidence_status,
    passageCount: passages.length,
    invalidCitationRemoved: normalised.reviewReasons.includes('invalid_citation_removed'),
    validCitationCount: normalised.sources.length,
    gaps: generated.output.gaps,
  });
  await saveAnswer({
    questionId,
    token,
    text: normalised.text,
    gaps: generated.output.gaps,
    modelEvidenceStatus: generated.output.evidence_status,
    evidenceStatus: ruled.evidenceStatus,
    reviewReasons: ruled.reviewReasons,
    model: generated.model,
    promptVersion: built.promptVersion || RFP_PROMPT_VERSION,
    retrievalMode: cfg.RETRIEVAL_MODE,
    passages,
    cited: new Map(normalised.sources.map((s) => [s.chunkId, s.citationNumber])),
  });
}

async function paidRfpGenerate(
  provider: Provider,
  prompt: string,
  deadline: number,
  deps: RfpAnswerDeps & { config: Config; employeeId: number },
  questionId: number,
  cfg: Config,
): Promise<{ output: RfpAnswerOutput; model: string }> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    if (now() >= deadline) {
      throw last instanceof ProviderError
        ? last
        : new ProviderError('DEADLINE', 'The request deadline passed before a new attempt could start.');
    }
    try {
      return await paidAttempt(
        {
          kind: 'rfp_generate',
          purpose: PURPOSE,
          attempt,
          model: cfg.GENERATION_MODEL,
          inputChars: prompt.length,
          employeeId: deps.employeeId,
          rfpQuestionId: questionId,
        },
        async () => {
          const result = await provider.generateStructured(
            {
              prompt,
              schema: rfpAnswerSchema,
              jsonSchema: rfpAnswerJsonSchema,
              kind: 'rfp_generate',
              stubKind: 'rfp',
              once: true,
            },
            deadline,
          );
          return { value: { output: result.output, model: result.model }, usage: result.usage };
        },
        cfg,
      );
    } catch (error) {
      last = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES + 1) {
        throw error;
      }
      const wait = Math.min(8_000, 200 * 2 ** (attempt - 1)) * (0.5 + Math.random());
      if (now() + wait >= deadline) {
        throw error;
      }
      await sleep(wait);
    }
  }
  throw last;
}

async function saveAnswer(input: {
  questionId: number;
  token: string;
  text: string;
  gaps: string[];
  modelEvidenceStatus: EvidenceStatus;
  evidenceStatus: EvidenceStatus;
  reviewReasons: string[];
  model: string;
  promptVersion: string;
  retrievalMode: string;
  passages: Passage[];
  cited: Map<number, number>;
}): Promise<void> {
  await db().transaction(async (tx) => {
    const [row] = rowsOf(
      await tx.execute(sql`select generation_token from rfp_questions where id = ${input.questionId} for update`),
    );
    if (!row || String(row.generation_token) !== input.token) {
      throw conflict('LOCK_TAKEN', 'The generation lock was taken over.');
    }
    const [answer] = await tx
      .insert(rfpAnswers)
      .values({
        questionId: input.questionId,
        answerText: input.text,
        evidenceStatus: input.evidenceStatus,
        modelEvidenceStatus: input.modelEvidenceStatus,
        gaps: input.gaps,
        reviewReasons: input.reviewReasons,
        model: input.model,
        promptVersion: input.promptVersion,
        retrievalMode: input.retrievalMode,
      })
      .returning({ id: rfpAnswers.id });

    for (const [i, passage] of input.passages.entries()) {
      await tx.execute(sql`
        insert into rfp_answer_sources (
          answer_id, rank, chunk_id, score, citation_number,
          document_id, version_id, title, heading, page_number
        ) values (
          ${answer!.id},
          ${i + 1},
          (select id from document_chunks where id = ${passage.chunkId}),
          ${passage.score},
          ${input.cited.get(passage.chunkId) ?? null},
          ${passage.documentId},
          ${passage.versionId},
          ${passage.title},
          ${passage.heading},
          ${passage.pageNumber}
        )
      `);
    }

    await tx
      .update(rfpQuestions)
      .set({ status: 'done', errorCode: null, generationToken: null, generationStartedAt: null })
      .where(and(eq(rfpQuestions.id, input.questionId), eq(rfpQuestions.generationToken, input.token)));
  });
}

export async function failQuestion(questionId: number, token: string, error: unknown): Promise<void> {
  const code = error instanceof ProviderError ? error.code : error instanceof AppError ? error.code : 'ERROR';
  await db()
    .update(rfpQuestions)
    .set({ status: 'failed', errorCode: code, generationToken: null, generationStartedAt: null })
    .where(and(eq(rfpQuestions.id, questionId), eq(rfpQuestions.generationToken, token)));
}

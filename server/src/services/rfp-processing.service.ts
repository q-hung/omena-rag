import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { rowsOf } from '../db/rows.ts';
import { notFound } from '../errors.ts';

const num = (v: unknown) => (v == null ? null : Number(v));

/** OBS-01: per-question pipeline state, every provider call, and RFP totals (p95 computed in SQL). */
export async function getRfpProcessing(rfpId: number) {
  const [rfp] = rowsOf(await db().execute(sql`select id from rfps where id = ${rfpId}`));
  if (!rfp) {
    throw notFound('RFP_NOT_FOUND', 'No such RFP.');
  }
  const questions = rowsOf(
    await db().execute(sql`
      select q.id, q.seq, q.status, q.attempts, q.error_code,
        la.id as answer_id, la.evidence_status, la.retrieval_mode,
        count(s.rank) as retrieved_count,
        count(s.citation_number) as cited_count
      from rfp_questions q
      left join lateral (
        select id, evidence_status, retrieval_mode from rfp_answers where question_id = q.id order by id desc limit 1
      ) la on true
      left join rfp_answer_sources s on s.answer_id = la.id
      where q.rfp_id = ${rfpId}
      group by q.id, la.id, la.evidence_status, la.retrieval_mode
      order by q.seq
    `),
  );
  const calls = rowsOf(
    await db().execute(sql`
      select c.id, c.rfp_question_id, c.kind, c.attempt, c.model, c.status, c.error_code,
        c.latency_ms, c.input_tokens, c.output_tokens, coalesce(c.cost_usd, c.estimated_cost_usd) as cost_usd
      from provider_calls c
      join rfp_questions q on q.id = c.rfp_question_id
      where q.rfp_id = ${rfpId}
      order by c.id
    `),
  );
  const [totals] = rowsOf(
    await db().execute(sql`
      select count(*) as calls,
        count(*) filter (where c.status = 'error') as failures,
        coalesce(sum(c.input_tokens), 0) as input_tokens,
        coalesce(sum(c.output_tokens), 0) as output_tokens,
        coalesce(sum(coalesce(c.cost_usd, c.estimated_cost_usd)), 0) as cost_usd,
        percentile_cont(0.95) within group (order by c.latency_ms) as p95_latency_ms
      from provider_calls c
      join rfp_questions q on q.id = c.rfp_question_id
      where q.rfp_id = ${rfpId}
    `),
  );

  const callsByQuestion = new Map<number, typeof calls>();
  for (const c of calls) {
    const key = Number(c.rfp_question_id);
    callsByQuestion.set(key, [...(callsByQuestion.get(key) ?? []), c]);
  }

  return {
    totals: {
      calls: Number(totals!.calls),
      failures: Number(totals!.failures),
      inputTokens: Number(totals!.input_tokens),
      outputTokens: Number(totals!.output_tokens),
      costUsd: Number(totals!.cost_usd),
      p95LatencyMs: num(totals!.p95_latency_ms),
    },
    questions: questions.map((q) => ({
      id: Number(q.id),
      seq: Number(q.seq),
      status: String(q.status),
      attempts: Number(q.attempts),
      errorCode: q.error_code == null ? null : String(q.error_code),
      evidenceStatus: q.evidence_status == null ? null : String(q.evidence_status),
      retrievalMode: q.retrieval_mode == null ? null : String(q.retrieval_mode),
      retrievedCount: Number(q.retrieved_count),
      citedCount: Number(q.cited_count),
      calls: (callsByQuestion.get(Number(q.id)) ?? [])
        .map((c) => ({
          id: Number(c.id),
          kind: String(c.kind),
          attempt: Number(c.attempt),
          model: String(c.model),
          status: String(c.status),
          errorCode: c.error_code == null ? null : String(c.error_code),
          latencyMs: num(c.latency_ms),
          inputTokens: num(c.input_tokens),
          outputTokens: num(c.output_tokens),
          costUsd: Number(c.cost_usd),
        })),
    })),
  };
}

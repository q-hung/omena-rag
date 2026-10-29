import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { config as loadConfig } from '../config/config.ts';
import { db } from '../db/index.ts';
import { rowsOf } from '../db/rows.ts';
import { AppError, conflict, notFound } from '../errors.ts';
import { ProviderError } from '../llm/errors.ts';
import { answerQuestion, failQuestion, type RfpAnswerDeps } from './rfp-answer.service.ts';
import { requireOwner } from './generate.service.ts';
import { getRfp } from './rfp.service.ts';
import { LOCK_TTL } from './state.service.ts';

const MAX_ATTEMPTS = 3;

/** REQ_V3 §7.1 step 1: one statement; done/queued/processing are untouched unless `force` adds done. */
export async function queueQuestions(rfpId: number, employeeId: number, force: boolean) {
  const [rfp] = rowsOf(await db().execute(sql`select status, created_by from rfps where id = ${rfpId}`));
  if (!rfp) {
    throw notFound('RFP_NOT_FOUND', 'No such RFP.');
  }
  requireOwner({ createdBy: Number(rfp.created_by) }, employeeId);
  if (rfp.status !== 'confirmed') {
    throw conflict('RFP_NOT_CONFIRMED', 'Confirm the questions before generating answers.');
  }
  const statuses = force ? ['pending', 'failed', 'done'] : ['pending', 'failed'];
  await db().execute(sql`
    update rfp_questions
    set status = 'queued', error_code = null, attempts = 0
    where rfp_id = ${rfpId} and status in (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})
  `);
  return getRfp(rfpId, employeeId);
}

/** §7.1 step 2: claim the next queued question across all RFPs. */
export async function claimQuestion() {
  const [row] = rowsOf(
    await db().execute(sql`
      update rfp_questions
      set status = 'processing', generation_token = ${randomUUID()}::uuid,
          generation_started_at = now(), attempts = attempts + 1, error_code = null
      where id = (
        select q.id from rfp_questions q
        where q.status = 'queued'
        order by q.rfp_id, q.seq
        for update skip locked
        limit 1
      )
      returning id, generation_token, rfp_id, attempts
    `),
  );
  if (!row) {
    return null;
  }
  const [rfp] = rowsOf(await db().execute(sql`select created_by from rfps where id = ${Number(row.rfp_id)}`));
  return {
    id: Number(row.id),
    token: String(row.generation_token),
    employeeId: Number(rfp!.created_by),
    rfpId: Number(row.rfp_id),
    attempt: Number(row.attempts),
  };
}

/** §7.1 step 6: a stuck `processing` question is re-queued, or failed after MAX_ATTEMPTS. The token is cleared so the old holder can't save. */
export async function failStaleQuestions(): Promise<number> {
  const rows = rowsOf(
    await db().execute(sql`
      update rfp_questions
      set status = case when attempts < ${MAX_ATTEMPTS} then 'queued' else 'failed' end,
          error_code = case when attempts < ${MAX_ATTEMPTS} then null else 'stale' end,
          generation_token = null, generation_started_at = null
      where status = 'processing'
        and generation_started_at < now() - ${LOCK_TTL}
      returning id
    `),
  );
  return rows.length;
}

/** Runs one claimed question and logs one allow-listed line (OBS-02, SEC-11). Returns true when the daily budget stopped it (PROC-03). */
export async function processQuestion(
  claimed: { id: number; token: string; employeeId: number; rfpId?: number; attempt?: number },
  deps: RfpAnswerDeps = {},
): Promise<boolean> {
  const log = deps.workerLog ?? ((line) => console.log(JSON.stringify(line)));
  const started = Date.now();
  // A failing log sink must never change question state, so it is contained here.
  const line = (status: string, extra: Record<string, unknown>) => {
    try {
      log({
        msg: 'rfp question processed',
        rfpId: claimed.rfpId ?? null,
        questionId: claimed.id,
        status,
        attempt: claimed.attempt ?? null,
        latencyMs: Date.now() - started,
        ...extra,
      });
    } catch (error) {
      console.error('rfp worker log failed', claimed.id, (error as Error)?.message);
    }
  };
  try {
    const outcome = await answerQuestion(claimed.id, claimed.token, {
      ...deps,
      config: loadConfig(),
      employeeId: claimed.employeeId,
    });
    line('done', { ...outcome, errorCode: null });
    return false;
  } catch (error) {
    if (error instanceof AppError && error.code === 'LOCK_TAKEN') {
      return false;
    }
    if (!(error instanceof AppError) && !(error instanceof ProviderError)) {
      console.error('rfp question failed unexpectedly', claimed.id, (error as Error)?.message);
    }
    await failQuestion(claimed.id, claimed.token, error);
    const errorCode = error instanceof ProviderError || error instanceof AppError ? error.code : 'ERROR';
    line('failed', { retrievedCount: null, evidenceStatus: null, errorCode });
    return error instanceof AppError && error.code === 'budget_reached';
  }
}

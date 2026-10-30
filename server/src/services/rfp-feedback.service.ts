import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { rowsOf } from '../db/rows.ts';

// RFP-EVAL-03. SQL only. Each answer counts once, by its latest review.
const LATEST_REVIEW = sql`
  select distinct on (answer_id) id, answer_id, verdict, final_text, flagged_citations
  from rfp_reviews order by answer_id, id desc
`;

export async function getRfpFeedback() {
  const verdicts = rowsOf(
    await db().execute(sql`
      with lr as (${LATEST_REVIEW})
      select lr.verdict, count(*) as n,
        count(*) filter (where lr.verdict = 'accepted' and lr.final_text = a.answer_text) as as_is,
        count(*) filter (where lr.verdict = 'accepted' and lr.final_text <> a.answer_text) as after_edit
      from lr join rfp_answers a on a.id = lr.answer_id
      group by lr.verdict
      order by lr.verdict
    `),
  );
  const wrongEvidence = rowsOf(
    await db().execute(sql`
      with lr as (${LATEST_REVIEW})
      select s.title, count(*) as n
      from lr
      cross join lateral unnest(lr.flagged_citations) as flagged(citation_number)
      join rfp_answer_sources s on s.answer_id = lr.answer_id and s.citation_number = flagged.citation_number
      where lr.verdict = 'wrong_evidence'
      group by s.title
      order by n desc, s.title
    `),
  );
  const byEvidence = rowsOf(
    await db().execute(sql`
      with lr as (${LATEST_REVIEW})
      select a.evidence_status, count(lr.id) as reviewed,
        count(lr.id) filter (where lr.verdict = 'accepted') as accepted
      from rfp_answers a left join lr on lr.answer_id = a.id
      group by a.evidence_status
      order by a.evidence_status
    `),
  );
  return {
    verdicts: verdicts.map((r) => ({
      verdict: String(r.verdict),
      count: Number(r.n),
      acceptedAsIs: Number(r.as_is),
      acceptedAfterEdit: Number(r.after_edit),
    })),
    wrongEvidenceByDocument: wrongEvidence.map((r) => ({ title: String(r.title), count: Number(r.n) })),
    acceptanceByEvidenceStatus: byEvidence.map((r) => ({
      evidenceStatus: String(r.evidence_status),
      reviewed: Number(r.reviewed),
      accepted: Number(r.accepted),
    })),
  };
}

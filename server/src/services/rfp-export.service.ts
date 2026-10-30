import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { rowsOf } from '../db/rows.ts';
import { notFound } from '../errors.ts';
import { stripMarkers } from '../rag/normalise.ts';

export type ExportFormat = 'md' | 'csv';
export const NOT_ANSWERED = 'Not answered';

type Row = { seq: number; section: string | null; question: string; answer: string | null; sources: string };

/** REV-05. Only a question whose latest answer's latest review is `accepted` carries text; everything else is "Not answered". */
async function loadRows(rfpId: number): Promise<{ title: string; rows: Row[] }> {
  const [rfp] = rowsOf(await db().execute(sql`select title from rfps where id = ${rfpId}`));
  if (!rfp) {
    throw notFound('RFP_NOT_FOUND', 'No such RFP.');
  }
  const questions = rowsOf(
    await db().execute(sql`
      select q.seq, q.section, q.text, la.id as answer_id, lr.final_text
      from rfp_questions q
      left join lateral (select id from rfp_answers where question_id = q.id order by id desc limit 1) la on true
      left join lateral (
        select verdict, final_text from rfp_reviews where answer_id = la.id order by id desc limit 1
      ) lr on lr.verdict = 'accepted'
      where q.rfp_id = ${rfpId}
      order by q.seq
    `),
  );
  const answerIds = questions.filter((q) => q.final_text != null).map((q) => Number(q.answer_id));
  const sources = answerIds.length
    ? rowsOf(
        await db().execute(sql`
          select s.answer_id, s.citation_number, s.title, s.heading, s.page_number, v.version_number
          from rfp_answer_sources s
          left join document_versions v on v.id = s.version_id
          where s.answer_id in (${sql.join(answerIds.map((id) => sql`${id}`), sql`, `)})
            and s.citation_number is not null
          order by s.answer_id, s.citation_number
        `),
      )
    : [];

  return {
    title: String(rfp.title),
    rows: questions.map((q) => {
      if (q.final_text == null) {
        return { seq: Number(q.seq), section: q.section as string | null, question: String(q.text), answer: null, sources: '' };
      }
      const finalText = String(q.final_text);
      // An edit may drop a [n]; list only the sources the final text still cites.
      const kept = new Set([...finalText.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
      const lines = sources
        .filter((s) => Number(s.answer_id) === Number(q.answer_id) && kept.has(Number(s.citation_number)))
        .map((s) => sourceLine(s));
      return {
        seq: Number(q.seq),
        section: q.section as string | null,
        question: String(q.text),
        answer: stripMarkers(finalText),
        sources: lines.join('; '),
      };
    }),
  };
}

function sourceLine(s: Record<string, unknown>): string {
  const parts = [String(s.title)];
  if (s.version_number != null) {
    parts[0] += ` v${s.version_number}`;
  }
  if (s.heading) {
    parts.push(String(s.heading));
  }
  if (s.page_number != null) {
    parts.push(`p. ${s.page_number}`);
  }
  return parts.join(', ');
}

function toMarkdown(title: string, rows: Row[]): string {
  const out = [`# ${title}`, ''];
  for (const r of rows) {
    out.push(`## Q${r.seq}. ${r.question}`, '');
    if (r.section) {
      out.push(`Section: ${r.section}`, '');
    }
    out.push(r.answer ?? `_${NOT_ANSWERED}_`, '');
    if (r.sources) {
      out.push(`Sources: ${r.sources}`, '');
    }
  }
  return out.join('\n');
}

/** A cell starting with = + - @ can run as a formula when the CSV is opened in a spreadsheet, so it gets a leading apostrophe. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function toCsv(rows: Row[]): string {
  const lines = [['Q', 'Section', 'Question', 'Answer', 'Sources'].map(cell).join(',')];
  for (const r of rows) {
    lines.push([String(r.seq), r.section ?? '', r.question, r.answer ?? NOT_ANSWERED, r.sources].map(cell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export async function exportRfp(rfpId: number, format: ExportFormat) {
  const { title, rows } = await loadRows(rfpId);
  if (format === 'csv') {
    return { filename: `rfp-${rfpId}.csv`, mimeType: 'text/csv; charset=utf-8', body: toCsv(rows) };
  }
  return { filename: `rfp-${rfpId}.md`, mimeType: 'text/markdown; charset=utf-8', body: toMarkdown(title, rows) };
}

import '../src/config/env.ts';
import { closeDb } from '../src/db/index.ts';
import { getRfpFeedback } from '../src/services/rfp-feedback.service.ts';

const f = await getRfpFeedback();
await closeDb();

console.log('Latest review per answer');
for (const v of f.verdicts) {
  const split = v.verdict === 'accepted' ? `  (as-is ${v.acceptedAsIs}, after edit ${v.acceptedAfterEdit})` : '';
  console.log(`  ${v.verdict.padEnd(15)} ${v.count}${split}`);
}
if (!f.verdicts.length) {
  console.log('  (no reviews yet)');
}
console.log('\nWrong-evidence citations by document');
for (const w of f.wrongEvidenceByDocument) {
  console.log(`  ${String(w.count).padStart(3)}  ${w.title}`);
}
if (!f.wrongEvidenceByDocument.length) {
  console.log('  (none)');
}
console.log('\nAcceptance rate by evidence status (reviewed answers)');
for (const e of f.acceptanceByEvidenceStatus) {
  const rate = e.reviewed ? `${((100 * e.accepted) / e.reviewed).toFixed(0)}%` : 'n/a';
  console.log(`  ${e.evidenceStatus.padEnd(22)} ${e.accepted}/${e.reviewed}  ${rate}`);
}

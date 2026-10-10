import './config/env.ts';
export {
  activateVersion,
  claimVersion,
  failStaleProcessing,
  processVersion,
  runWorker,
} from './ingest/indexing.ts';
export { claimQuestion, failStaleQuestions } from './services/rfp-queue.service.ts';

const entry = process.argv[1] ?? '';
if (entry.endsWith('worker.ts') || entry.endsWith('worker.js')) {
  const { runWorker } = await import('./ingest/indexing.ts');
  runWorker().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

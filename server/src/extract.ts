import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { ExtractResult } from './extract/run.ts';

export type { ExtractResult } from './extract/run.ts';

export const EXTRACT_TIMEOUT_MS = 60_000;
const CHILD = join(import.meta.dirname, 'extract-child.ts');

export async function extract(
  bytes: Buffer,
  filename: string,
  options: { timeoutMs?: number; extra?: Record<string, unknown> } = {},
): Promise<ExtractResult> {
  const timeoutMs = options.timeoutMs ?? EXTRACT_TIMEOUT_MS;
  const child = spawn(process.execPath, ['--max-old-space-size=256', CHILD], {
    env: {},
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (c: Buffer) => stdout.push(c));
  child.stderr.on('data', (c: Buffer) => stderr.push(c));

  const payload = JSON.stringify({
    filename,
    bytes: bytes.toString('base64'),
    ...options.extra,
  });

  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut || signal === 'SIGKILL' || code === 137) {
        reject(new Error('Extraction timed out.'));
        return;
      }
      const raw = Buffer.concat(stdout).toString('utf8').trim();
      if (!raw) {
        reject(new Error(code === 0 ? 'Extraction produced no output.' : 'Extraction exceeded the memory limit.'));
        return;
      }
      let parsed: { ok?: boolean; result?: ExtractResult; error?: string };
      try {
        parsed = JSON.parse(raw) as typeof parsed;
      } catch {
        reject(new Error('Extraction failed.'));
        return;
      }
      if (!parsed.ok || !parsed.result) {
        reject(new Error(parsed.error || 'Extraction failed.'));
        return;
      }
      resolve(parsed.result);
    });

    child.stdin.end(payload);
  });
}

import { ProviderError, isRetryable } from './errors.ts';

export const MAX_RETRIES = 2;

export type AttemptFn<T> = (signal: AbortSignal) => Promise<T>;

export async function withRetries<T>(
  fn: AttemptFn<T>,
  opts: {
    timeoutMs: number;
    deadline: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    maxRetries?: number;
  },
): Promise<T> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;
  let last: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = now();
    if (start >= opts.deadline) {
      throw last instanceof ProviderError
        ? last
        : new ProviderError('DEADLINE', 'The request deadline passed before a new attempt could start.', false);
    }

    const budget = Math.max(1, Math.min(opts.timeoutMs, opts.deadline - start));
    try {
      return await timed(fn, budget);
    } catch (error) {
      last = error;
      if (!isRetryable(error) || attempt === maxRetries) throw error;
      const wait = backoff(attempt);
      if (now() + wait >= opts.deadline) throw error;
      await sleep(wait);
    }
  }

  throw last;
}

function timed<T>(fn: AttemptFn<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new ProviderError('TIMEOUT', `Provider call timed out after ${ms}ms.`, true));
    }, ms);
    fn(ctrl.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function backoff(attempt: number): number {
  return Math.min(8_000, 200 * 2 ** attempt) * (0.5 + Math.random());
}

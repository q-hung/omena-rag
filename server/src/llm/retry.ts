import { ProviderError, isRetryable } from './errors.ts';

export const MAX_RETRIES = 2;

export type AttemptFn<T> = (signal: AbortSignal) => Promise<T>;

/** Calls `fn(attempt)` (1-based) until it succeeds, a non-retryable error, the last attempt, or the deadline. */
export async function retryAttempts<T>(
  fn: (attempt: number) => Promise<T>,
  opts: {
    deadline: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    maxRetries?: number;
  },
): Promise<T> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const lastAttempt = (opts.maxRetries ?? MAX_RETRIES) + 1;
  let last: unknown;

  for (let attempt = 1; attempt <= lastAttempt; attempt++) {
    if (now() >= opts.deadline) {
      throw last instanceof ProviderError
        ? last
        : new ProviderError('DEADLINE', 'The request deadline passed before a new attempt could start.', false);
    }
    try {
      return await fn(attempt);
    } catch (error) {
      last = error;
      if (!isRetryable(error) || attempt === lastAttempt) {
        throw error;
      }
      const wait = backoff(attempt - 1);
      if (now() + wait >= opts.deadline) {
        throw error;
      }
      await sleep(wait);
    }
  }

  throw last;
}

export function withRetries<T>(
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
  return retryAttempts(() => timed(fn, Math.max(1, Math.min(opts.timeoutMs, opts.deadline - now()))), opts);
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

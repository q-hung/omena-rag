import { describe, expect, it } from 'vitest';
import { ProviderError } from '../src/llm/errors.ts';
import { retryAttempts } from '../src/llm/retry.ts';

const retryable = () => new ProviderError('TIMEOUT', 'slow', true);
const noSleep = async () => {};

describe('retryAttempts', () => {
  it('passes 1-based attempt numbers and returns the first success', async () => {
    const seen: number[] = [];
    const out = await retryAttempts(
      async (attempt) => {
        seen.push(attempt);
        if (attempt < 3) {
          throw retryable();
        }
        return 'ok';
      },
      { deadline: Date.now() + 60_000, sleep: noSleep },
    );
    expect(out).toBe('ok');
    expect(seen).toEqual([1, 2, 3]);
  });

  it('stops at once on a non-retryable error', async () => {
    let calls = 0;
    await expect(
      retryAttempts(
        async () => {
          calls++;
          throw new ProviderError('BAD_REQUEST', 'no', false);
        },
        { deadline: Date.now() + 60_000, sleep: noSleep },
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(calls).toBe(1);
  });

  it('gives up after maxRetries + 1 attempts with the last error', async () => {
    let calls = 0;
    await expect(
      retryAttempts(
        async () => {
          calls++;
          throw retryable();
        },
        { deadline: Date.now() + 60_000, sleep: noSleep, maxRetries: 1 },
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(calls).toBe(2);
  });

  it('throws DEADLINE when the deadline has already passed', async () => {
    await expect(retryAttempts(async () => 'never', { deadline: 0, now: () => 1 })).rejects.toMatchObject({
      code: 'DEADLINE',
    });
  });

  it('does not sleep past the deadline', async () => {
    let now = 0;
    let slept = 0;
    await expect(
      retryAttempts(
        async () => {
          throw retryable();
        },
        {
          deadline: 10,
          now: () => now,
          sleep: async (ms) => {
            slept += ms;
            now += ms;
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(slept).toBe(0);
  });
});

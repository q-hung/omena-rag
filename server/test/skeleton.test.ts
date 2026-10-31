import { describe, expect, it } from 'vitest';

describe('workspace skeleton', () => {
  it('runs TypeScript under Vitest', () => {
    const greet = (who: string): string => `hello ${who}`;
    expect(greet('omena')).toBe('hello omena');
  });
});

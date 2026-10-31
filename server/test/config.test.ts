import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/config.ts';

const base = { DATABASE_URL: 'postgres://omena:omena@localhost:5433/omena' };

describe('config', () => {
  it('defaults to the stub provider and needs no key', () => {
    const cfg = loadConfig(base);
    expect(cfg.LLM_PROVIDER).toBe('stub');
    expect(cfg.EMBEDDING_DIMENSIONS).toBe(768);
    expect(cfg.COOKIE_SECURE).toBe(true);
    expect(cfg.JUDGE_MODEL).not.toBe(cfg.GENERATION_MODEL);
  });

  it('fails fast when gemini is selected without a key', () => {
    expect(() => loadConfig({ ...base, LLM_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY/);
  });

  it('accepts gemini with a key', () => {
    const cfg = loadConfig({ ...base, LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' });
    expect(cfg.GEMINI_API_KEY).toBe('k');
  });

  it('requires a database url', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('coerces numbers and the cookie flag', () => {
    const cfg = loadConfig({ ...base, DAILY_BUDGET_USD: '1.5', COOKIE_SECURE: 'false' });
    expect(cfg.DAILY_BUDGET_USD).toBe(1.5);
    expect(cfg.COOKIE_SECURE).toBe(false);
  });
});

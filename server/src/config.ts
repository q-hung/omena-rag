import { z } from 'zod';

// REQ §14 (LLM configuration), §10 (prices, budget), SEC-01/09, RET-02.
// Prices are USD per million tokens, as published for the configured models.
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8080),
    DATABASE_URL: z.string().min(1),

    LLM_PROVIDER: z.enum(['stub', 'gemini']).default('stub'),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GENERATION_MODEL: z.string().min(1).default('gemini-2.5-flash-lite'),
    EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-2'),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),

    PRICE_GENERATION_INPUT_USD_PER_MTOK: z.coerce.number().nonnegative().default(0.1),
    PRICE_GENERATION_OUTPUT_USD_PER_MTOK: z.coerce.number().nonnegative().default(0.4),
    PRICE_EMBEDDING_INPUT_USD_PER_MTOK: z.coerce.number().nonnegative().default(0.15),

    RETRIEVAL_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
    DAILY_BUDGET_USD: z.coerce.number().positive().default(5),

    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    APP_ORIGIN: z.string().url().default('http://localhost:8080'),
    SESSION_HOURS: z.coerce.number().positive().default(12),

    SEED_EMPLOYEE_PASSWORD: z.string().min(1).default('jarvis-demo'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.LLM_PROVIDER === 'gemini' && !cfg.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'GEMINI_API_KEY is required when LLM_PROVIDER=gemini',
      });
    }
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

let cached: Config | undefined;

export function config(): Config {
  cached ??= loadConfig();
  return cached;
}

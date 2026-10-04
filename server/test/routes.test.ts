import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.ts';

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('route inventory', () => {
  it('matches the committed printRoutes snapshot', () => {
    expect(app.printRoutes({ commonPrefix: false })).toMatchSnapshot();
  });
});

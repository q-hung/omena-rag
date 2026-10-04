import { z } from 'zod';
import type { App } from '../app.ts';
import { getAccountFacts, listAccounts } from '../services/account.service.ts';

export function registerAccounts(app: App): void {
  app.get('/api/accounts', async () => listAccounts());

  app.get(
    '/api/accounts/:id/facts',
    { schema: { params: z.object({ id: z.string() }) } },
    async (request) => getAccountFacts(request.params.id),
  );
}

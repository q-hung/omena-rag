import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SERVER_ROOT } from '../src/lib/paths.ts';
import { buildPdf } from '../src/ingest/extract/pdfBytes.ts';

const dir = join(SERVER_ROOT, 'fixtures/kb');

await writeFile(
  join(dir, 'sso-setup-guide.pdf'),
  buildPdf([
    'Requirements. SAML single sign-on is available on the Enterprise plan. On other plans, the option is shown as locked.',
    '',
    'Enable SSO. Go to Settings → Security → Single sign-on, upload your identity provider metadata, then test the connection before enforcing SSO.',
  ]),
);

await writeFile(join(dir, 'failed-payment-retries.pdf'), buildPdf(['']));

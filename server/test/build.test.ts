import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Emits the server like `pnpm build`, but inside node_modules/.cache so imports still resolve, then runs the JS.
const root = join(import.meta.dirname, '..');
let outDir: string;

beforeAll(() => {
  outDir = mkdtempSync(join(root, 'node_modules/.cache/build-test-'));
  const tsc = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json', '--outDir', outDir], { cwd: root, encoding: 'utf8' });
  expect(tsc.status, tsc.stdout + tsc.stderr).toBe(0);
}, 60_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('emitted JS (P20)', () => {
  it('leaves no .ts import specifiers and keeps source maps', () => {
    expect(existsSync(join(outDir, 'src/api.js.map'))).toBe(true);
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', "import('node:fs').then(({readFileSync})=>{const s=readFileSync('src/seed.js','utf8');process.exit(/from '[^']+\\.ts'/.test(s)?1:0)})"], { cwd: outDir });
    expect(run.status).toBe(0);
  });

  it('finds the server root and its data files from dist, and runs the extract child (.js, not .ts)', () => {
    const script = `
      const { SERVER_ROOT } = await import('./src/lib/paths.js');
      const { extract } = await import('./src/ingest/extract.js');
      const { existsSync } = await import('node:fs');
      const { join } = await import('node:path');
      const r = await extract(Buffer.from('# Hi\\n\\nbody text\\n'), 'a.md');
      console.log(JSON.stringify({
        root: SERVER_ROOT,
        data: ['drizzle', 'fixtures/kb/plan-comparison.md', 'eval/golden.json'].map((p) => existsSync(join(SERVER_ROOT, p))),
        heading: r.sections[0]?.heading,
      }));`;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: outDir, encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ root, data: [true, true, true], heading: 'Hi' });
  });
});

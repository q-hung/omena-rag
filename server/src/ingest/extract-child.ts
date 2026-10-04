import { extractInProcess } from './extract/run.ts';

for (const key of Object.keys(process.env)) {
  delete process.env[key];
}

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const msg = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
  hang?: boolean;
  probe?: string;
  bytes?: string;
  filename?: string;
};

if (msg.hang) {
  setInterval(() => {}, 1 << 30);
} else if (msg.probe === 'env') {
  process.stdout.write(JSON.stringify({ ok: true, env: process.env }));
} else {
  try {
    const result = await extractInProcess(Buffer.from(msg.bytes ?? '', 'base64'), msg.filename ?? 'file.md');
    process.stdout.write(JSON.stringify({ ok: true, result }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed.';
    process.stdout.write(JSON.stringify({ ok: false, error: message }));
  }
}

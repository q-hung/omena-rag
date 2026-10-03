export function multipart(
  fields: Record<string, string>,
  file?: { name: string; bytes: Buffer; type?: string },
) {
  const boundary = '----JarvisTestBoundary';
  const chunks: Buffer[] = [];
  const push = (value: string | Buffer) => chunks.push(typeof value === 'string' ? Buffer.from(value) : value);
  for (const [name, value] of Object.entries(fields)) {
    push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  }
  if (file) {
    push(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type ?? 'application/octet-stream'}\r\n\r\n`,
    );
    push(file.bytes);
    push('\r\n');
  }
  push(`--${boundary}--\r\n`);
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

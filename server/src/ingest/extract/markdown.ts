export type MarkdownSection = { heading: string; path: string; text: string };

/** Headings are `#`–`###` lines outside fenced code blocks. */
export function extractMarkdown(source: string): MarkdownSection[] {
  const sections: { level: number; heading: string; path: string; lines: string[] }[] = [];
  const stack: { level: number; heading: string }[] = [];
  let fence = false;
  let current = { level: 0, heading: '', path: '', lines: [] as string[] };

  const push = () => {
    if (current.heading || current.lines.join('\n').trim()) {
      sections.push(current);
    }
  };

  for (const line of source.split(/\r?\n/)) {
    if (/^```/.test(line)) {
      fence = !fence;
      current.lines.push(line);
      continue;
    }
    const match = !fence ? /^(#{1,3})\s+(.+?)\s*$/.exec(line) : null;
    if (match) {
      push();
      const level = match[1]!.length;
      const heading = match[2]!.trim();
      while (stack.length && stack.at(-1)!.level >= level) {
        stack.pop();
      }
      stack.push({ level, heading });
      current = { level, heading, path: stack.map((s) => s.heading).join(' > '), lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  push();

  return sections
    .map((s) => ({ heading: s.heading, path: s.path, text: s.lines.join('\n').trim() }))
    .filter((s) => s.text);
}

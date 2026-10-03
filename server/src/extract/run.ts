import { extname } from 'node:path';
import { extractMarkdown, type MarkdownSection } from './markdown.ts';
import { extractPdf, type PdfPage } from './pdf.ts';

export type ExtractResult = {
  kind: 'pdf' | 'md';
  pages: PdfPage[];
  sections: MarkdownSection[];
  warnings: string[];
  pageCount: number;
};

export async function extractInProcess(bytes: Buffer, filename: string): Promise<ExtractResult> {
  const ext = extname(filename).toLowerCase();
  if (ext === '.pdf') {
    const pdf = await extractPdf(bytes);
    return { kind: 'pdf', pages: pdf.pages, sections: [], warnings: pdf.warnings, pageCount: pdf.pageCount };
  }
  if (ext === '.md' || ext === '.markdown') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { kind: 'md', pages: [], sections: extractMarkdown(text), warnings: [], pageCount: 0 };
  }
  throw new Error('Only PDF and Markdown files can be indexed.');
}

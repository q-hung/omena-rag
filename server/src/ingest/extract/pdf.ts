import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type PdfPage = { page: number; text: string };

export function blankPageWarning(pages: number[]): string {
  if (pages.length === 1) {
    return `Page ${pages[0]} has no text layer and was not indexed.`;
  }
  return `Pages ${pages.join(', ')} have no text layer and were not indexed.`;
}

export async function extractPdf(bytes: Buffer): Promise<{ pages: PdfPage[]; warnings: string[]; pageCount: number }> {
  let doc;
  try {
    doc = await getDocument({
      data: new Uint8Array(bytes),
      // pdfjs-dist 6 dropped the flag; eval stays disabled (CVE-2024-4367).
      isEvalSupported: false,
      useSystemFonts: false,
      isOffscreenCanvasSupported: false,
      disableFontFace: true,
    } as Parameters<typeof getDocument>[0]).promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException' || /password|encrypt/i.test(String(error))) {
      throw new Error('Encrypted PDFs are not supported.');
    }
    throw new Error('PDF extraction failed.');
  }

  if (doc.numPages > 100) {
    throw new Error('PDFs cannot have more than 100 pages.');
  }
  const pages: PdfPage[] = [];
  const blank: number[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) {
      pages.push({ page: n, text });
    } else {
      blank.push(n);
    }
  }
  if (!pages.length) {
    throw new Error("No page has a text layer. OCR isn't supported.");
  }
  return {
    pages,
    warnings: blank.length ? [blankPageWarning(blank)] : [],
    pageCount: doc.numPages,
  };
}

// DEC-5: gemini-embedding-2 task instructions go in the text, not taskType.
// Search / retrieval (asymmetric): query prefix + document title/text.

export function formatDocumentForEmbedding(chunk: { title?: string; text: string }): string {
  return `title: ${chunk.title?.trim() || 'none'} | text: ${chunk.text}`;
}

export function formatQueryForEmbedding(query: string): string {
  return `task: search result | query: ${query}`;
}

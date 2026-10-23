export interface DocumentInput {
  room: string; id: string; title: string; source: string; text: string; kind?: string; version?: string;
}
export interface Passage {
  citation: string; documentId: string; source: string; title: string; version: string;
  lineStart: number; lineEnd: number; text: string;
}
export interface SearchInput {
  room: string; query: string; topK?: number; candidates?: number;
  strategy?: 'hybrid' | 'dense' | 'bm25'; maxContextChars?: number;
}
export interface SearchResponse {
  results: Array<{ id: string; documentId: string; original: string; context: string; score: number;
    source: string; title: string; version: string; room: string; kind: string; revision: string;
    index: number; start: number; end: number; lineStart: number; lineEnd: number }>;
  context: { passages: Passage[]; instruction: string };
  diagnostics: { mode: string; strategy: string; reranked: boolean; searchedChunks: number;
    candidates: number; contextChars: number; durationMs: number };
}
export class GalaxyKnowledgeClient {
  constructor(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch });
  indexDocument(document: DocumentInput): Promise<{ id: string; revision: string; chunks: number; unchanged: boolean }>;
  search(input: SearchInput): Promise<SearchResponse>;
  answer(input: SearchInput): Promise<{ answer: string; citationIds: string[]; context: SearchResponse['context']; diagnostics: SearchResponse['diagnostics'] }>;
  listDocuments(room: string): Promise<{ documents: Array<Omit<DocumentInput, 'text'> & { revision: string; chunks: number }> }>;
  deleteDocument(room: string, id: string): Promise<{ deleted: boolean }>;
  indexCode(input: { room: string; repository: string; path: string; revision: string; language?: string; text: string }): ReturnType<GalaxyKnowledgeClient['indexDocument']>;
  getContext(input: Pick<SearchInput, 'room' | 'query' | 'topK' | 'maxContextChars'>): Promise<SearchResponse['context']>;
}

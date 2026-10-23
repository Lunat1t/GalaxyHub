/** Server-side client shared by GalaxyHub and GalaxyCode. Never ship bearer tokens to the browser. */
export class GalaxyKnowledgeClient {
  constructor({ baseUrl, token, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.token = token; this.fetch = fetchImpl;
  }
  async request(path, method = 'GET', payload) {
    const response = await this.fetch(`${this.baseUrl}${path}`, { method,
      headers: { authorization: `Bearer ${this.token}`, ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(300000), redirect: 'error' });
    const data = await response.json();
    if (!response.ok) throw new Error(`Galaxy knowledge (${response.status}): ${data.error}`);
    return data;
  }
  indexDocument(document) { return this.request('/v1/documents', 'POST', document); }
  search(input) { return this.request('/v1/search', 'POST', input); }
  answer(input) { return this.request('/v1/answer', 'POST', input); }
  listDocuments(room) { return this.request(`/v1/documents?${new URLSearchParams({ room })}`); }
  deleteDocument(room, id) { return this.request(`/v1/documents?${new URLSearchParams({ room, id })}`, 'DELETE'); }
  /** GalaxyCode supplies approved file contents; this client never traverses repositories. */
  indexCode({ room, repository, path, revision, language, text }) {
    return this.indexDocument({ room, id: `${repository}:${path}`, title: `${repository} / ${path}`,
      source: `${repository}@${revision}:${path}`, version: revision, kind: `code:${language ?? 'text'}`, text });
  }
  async getContext({ room, query, topK = 5, maxContextChars = 16000 }) {
    const response = await this.search({ room, query, topK, maxContextChars });
    return response.context;
  }
}

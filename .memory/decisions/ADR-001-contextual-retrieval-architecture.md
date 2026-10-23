# ADR-001: Contextual Retrieval as Standalone Zero-Dependency Service

- **Date:** 2026-10-10
- **Status:** Accepted & Implemented (`v0.1.0`)
- **Context:** At project inception, only the product concept ([Galaxy-Hub.md](file:///home/bah/GalaxyHub/Galaxy-Hub.md)) existed. Before building the full Next.js + Phaser web application, the team needed a working knowledge retrieval module for `Project Rooms` and `GalaxyCode` integration.
- **Decision:**
  1. Implement `galaxy-contextual-retrieval` as an independent HTTP API (`src/server.mjs`), read-only MCP server (`src/mcp.mjs`), and SDK (`sdk/galaxy-code.mjs`) using Node.js `>=22.13` built-in `node:sqlite` with zero external dependencies.
  2. Support three provider modes: `demo` (offline deterministic), `codex` (local Codex App Server via saved ChatGPT login, BM25-only), and `remote` (Anthropic contextual prefixes + Embeddings + Cohere Rerank).
  3. Enforce strict `{ tenant, room }` isolation and treat all indexed passages as untrusted evidence.
- **Consequences:**
  - Can be embedded into or called by the future Next.js backend without coupling search to the Phaser/Colyseus game world.
  - Local developers and AI agents can query indexed knowledge immediately via MCP (`galaxyhub_knowledge`) or `npm run search`.

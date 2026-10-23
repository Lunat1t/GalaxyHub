# GalaxyHub — Master Roadmap & Plan Registry

> **Layer:** Strategic & Tactical Planning Memory
> **Related Skill:** [`spec-driven-planning`](file:///home/bah/GalaxyHub/.agents/skills/spec-driven-planning/SKILL.md)

---

## Stage 0: Contextual Retrieval Foundation (`v0.1.0`) — [COMPLETED]
- [x] Core SQLite storage & Contextual Retrieval (`src/retrieval.mjs`)
- [x] Multi-tenant / multi-room HTTP API (`src/server.mjs`)
- [x] Demo, Remote (Anthropic + Embeddings + Rerank), and Codex App Server providers (`src/providers.mjs`, `src/codex.mjs`)
- [x] Read-only MCP server (`src/mcp.mjs`) & CLI search (`scripts/search.mjs`)
- [x] `GalaxyKnowledgeClient` SDK (`sdk/galaxy-code.mjs`) & evaluation suite (`scripts/evaluate.mjs`)

---

## Stage 0.5: Cognitive Agent Infrastructure — [COMPLETED]
- [x] Second Brain memory hierarchy (`.memory/INDEX.md`, `CONTEXT.md`, `knowledge/`, `decisions/`, `plans/`, `episodes/`, `lessons/`)
- [x] Advanced multi-agent & workflow skills in `.agents/skills/`:
  - `second-brain-memory`
  - `multi-agent-orchestrator`
  - `spec-driven-planning`
  - `elite-dev-lifecycle`

---

## Stage 1: GalaxyHub MVP ("Café to Project Room" Core Loop) — [PLANNED]
> **Hypothesis ([Galaxy-Hub.md:31](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L31)):** Does Galaxy Hub help people start a conversation in `Café` and continue it with collaborative work in a `Project Room`?

### Milestone 1.1: Web Foundation & Direct Project Rooms (`Next.js + PostgreSQL`)
- [ ] **SPEC-001:** User profiles, visibility settings, block/report moderation primitives ([Galaxy-Hub.md:20,29](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L20)).
- [ ] **SPEC-002:** `Project Rooms` CRUD, direct link entry (mobile/desktop friendly without loading game map), message feed, code/task links, and integration with `GalaxyKnowledgeClient` ([Galaxy-Hub.md:21,37](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L21)).

### Milestone 1.2: Live `Café` Space (`Phaser + Colyseus`)
- [ ] **SPEC-003:** Lazy-loaded `Café` pixel space with avatar movement and text chat ([Galaxy-Hub.md:29,37](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L29)).
- [ ] **SPEC-004:** Table-based proximity voice chat zones (sitting at a table enables voice chat for that table without disturbing others) ([Galaxy-Hub.md:29](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L29)).
- [ ] **SPEC-005:** One-click "Spin up Project Room from Conversation" action inside `Café` ([Galaxy-Hub.md:15,43](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L15)).

---

## Stage 2: Community Scaling & Retrieval Productionization — [FUTURE]
- [ ] Migrate `galaxy-contextual-retrieval` storage option to PostgreSQL/`pgvector` + background job queue + Anthropic Batch API ([README.md:189](file:///home/bah/GalaxyHub/README.md#L189)).
- [ ] Events, Organizer Tools, and `Skills Library` ([Galaxy-Hub.md:22-23,41](file:///home/bah/GalaxyHub/Galaxy-Hub.md#L22-L23)).

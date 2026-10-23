# GalaxyHub Second Brain — Memory Index (MOC)

> **Last Updated:** 2026-10-23
> **Purpose:** Central cognitive hub ("Second Brain") for all agents operating in the GalaxyHub workspace. Read this file at the start of every session to ground context, check active plans, and recall architectural decisions and lessons learned.

---

## 1. Project Snapshot (`Current State vs. Concept`)

- **Product Vision (Concept Only):** [Galaxy-Hub.md](file:///home/bah/GalaxyHub/Galaxy-Hub.md) — Browser-based social pixel-art network for developers (`Café` room with table-based proximity voice chat, avatars, Project Rooms, Events, Skills Library). Planned stack: TypeScript, Next.js, Phaser, Colyseus, PostgreSQL.
- **Implemented Codebase (`v0.1.0`):** [package.json](file:///home/bah/GalaxyHub/package.json) / [README.md](file:///home/bah/GalaxyHub/README.md) — `galaxy-contextual-retrieval`, a zero-dependency Node.js (`>=22.13`, `node:sqlite`) Contextual Retrieval service and SDK client (`GalaxyKnowledgeClient`) with BM25, Dense, and Hybrid (RRF + Rerank) search, multi-tenant/room isolation, Codex App Server integration, and a read-only MCP server (`galaxyhub_knowledge`).

---

## 2. Memory Architecture & Navigation

| Memory Layer | Location | Description |
| :--- | :--- | :--- |
| **Core Context** | [.memory/CONTEXT.md](file:///home/bah/GalaxyHub/.memory/CONTEXT.md) | System architecture, module boundaries, invariants, and security rules. |
| **Semantic Memory (Knowledge Graph)** | [.memory/knowledge/architecture-map.md](file:///home/bah/GalaxyHub/.memory/knowledge/architecture-map.md)<br>[.memory/knowledge/domain-glossary.md](file:///home/bah/GalaxyHub/.memory/knowledge/domain-glossary.md) | Component maps, API contracts, data schemas, and domain concepts. |
| **Architectural Decisions (ADRs)** | [.memory/decisions/ADR-001-contextual-retrieval-architecture.md](file:///home/bah/GalaxyHub/.memory/decisions/ADR-001-contextual-retrieval-architecture.md)<br>[.memory/decisions/ADR-002-second-brain-and-multi-agent-system.md](file:///home/bah/GalaxyHub/.memory/decisions/ADR-002-second-brain-and-multi-agent-system.md) | Immutable records of technical decisions, trade-offs, and consequences. |
| **Active & Completed Plans** | [.memory/plans/ROADMAP.md](file:///home/bah/GalaxyHub/.memory/plans/ROADMAP.md) | Product & engineering roadmap, DAG task breakdowns, and specs. |
| **Episodic Memory (Sessions)** | [.memory/episodes/](file:///home/bah/GalaxyHub/.memory/episodes/) | Chronological handoffs, task execution logs, and subagent summaries. |
| **Procedural Memory (Lessons)** | [.memory/lessons/PATTERNS_AND_PITFALLS.md](file:///home/bah/GalaxyHub/.memory/lessons/PATTERNS_AND_PITFALLS.md) | Distilled engineering rules, debugging insights, and anti-patterns. |

---

## 3. Active Skills & Agent Capabilities (`.agents/skills/`)

1. **`second-brain-memory`** — [.agents/skills/second-brain-memory/SKILL.md](file:///home/bah/GalaxyHub/.agents/skills/second-brain-memory/SKILL.md)
   - *When to use:* Session bootstrap, recording ADRs, saving episodic handoffs, distilling lessons, and syncing with `galaxyhub_knowledge`.
2. **`multi-agent-orchestrator`** — [.agents/skills/multi-agent-orchestrator/SKILL.md](file:///home/bah/GalaxyHub/.agents/skills/multi-agent-orchestrator/SKILL.md)
   - *When to use:* Complex tasks requiring parallel research, isolated branch implementation, or multi-perspective review via specialized subagents (`Architect`, `Researcher`, `Implementer`, `Reviewer`, `Memory Curator`).
3. **`spec-driven-planning`** — [.agents/skills/spec-driven-planning/SKILL.md](file:///home/bah/GalaxyHub/.agents/skills/spec-driven-planning/SKILL.md)
   - *When to use:* Designing new features, writing RFCs/Specs, decomposing epics into executable DAG tasks with acceptance criteria.
4. **`elite-dev-lifecycle`** — [.agents/skills/elite-dev-lifecycle/SKILL.md](file:///home/bah/GalaxyHub/.agents/skills/elite-dev-lifecycle/SKILL.md)
   - *When to use:* Writing code, TDD loops (`Red -> Green -> Refactor`), root-cause debugging, and security/performance audits.

---

## 4. Current Active Priorities

- [x] **Bootstrap Contextual Retrieval Engine (`v0.1.0`)** — Completed (`src/`, `sdk/`, `test/`).
- [x] **Initialize Second Brain Memory & Multi-Agent Skill Ecosystem** — Completed (`.memory/`, `.agents/skills/`, `AGENTS.md`).
- [ ] **Phase 1 Prototype Plan:** Spec and scaffold the end-to-end user journey from `Café` proximity encounter to creating a shared `Project Room` (see [.memory/plans/ROADMAP.md](file:///home/bah/GalaxyHub/.memory/plans/ROADMAP.md)).

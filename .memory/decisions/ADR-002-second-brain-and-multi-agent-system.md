# ADR-002: File-Based Second Brain Memory & Multi-Agent Skill Architecture

- **Date:** 2026-10-23
- **Status:** Accepted & Implemented
- **Context:** Agents need persistent cross-session memory ("Second Brain"), structured architectural planning, multi-agent orchestration, and rigorous development workflows without modifying the core `galaxy-contextual-retrieval` server code.
- **Decision:**
  1. **Structured File-Based Second Brain (`.memory/`):** Organize persistent agent memory into a Zettelkasten / Map-of-Content (MOC) hierarchy under `.memory/` (`INDEX.md`, `CONTEXT.md`, `knowledge/`, `decisions/`, `plans/`, `episodes/`, `lessons/`).
  2. **Progressive Disclosure Skills (`.agents/skills/`):** Package specialized operational runbooks into four modular skills discovered automatically by Antigravity:
     - `second-brain-memory` (cognitive memory read/write/consolidation protocol)
     - `multi-agent-orchestrator` (subagent topology, role delegation, branch isolation, consensus review)
     - `spec-driven-planning` (RFC/Spec authoring, DAG task decomposition, risk matrices)
     - `elite-dev-lifecycle` (Gold Context localization, TDD loop, root-cause debugging, security & quality gates)
  3. **Always-On Rule Alignment (`AGENTS.md`):** Keep `AGENTS.md` concise and within token budgets, binding the `galaxyhub_knowledge` MCP rules with the `.memory/INDEX.md` Second Brain protocol.
- **Consequences:**
  - Zero runtime overhead or code changes to `src/`.
  - Context window stays lean via progressive disclosure (skills load only when triggered; `.memory/INDEX.md` routes agents to exact memory files).
  - Seamless handoffs across sessions and subagents.

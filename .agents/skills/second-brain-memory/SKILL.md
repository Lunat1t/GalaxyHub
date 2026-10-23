---
name: second-brain-memory
description: >-
  Manages the GalaxyHub Second Brain cognitive memory system (.memory/) and bridges it
  with the galaxyhub_knowledge Contextual Retrieval index. Use this skill at the start
  of complex tasks to recall architectural context, when recording Architectural Decision
  Records (ADRs), when logging episodic session handoffs, or when distilling reusable
  engineering lessons and patterns.
---

# Second Brain Memory Protocol (`second-brain-memory`)

The GalaxyHub workspace uses a dual-tier **Second Brain** architecture:
1. **Structured Markdown Memory (`.memory/`)**: Fast, human-and-agent-readable Map of Content (MOC) storing semantic maps, ADRs, active plans, episodic logs, and distilled lessons.
2. **Contextual Retrieval Index (`galaxyhub_knowledge` MCP / `npm run search`)**: Indexed full-text and BM25/hybrid search over project documents and code per room.

---

## 1. Cognitive Memory Architecture (`.memory/`)

```text
.memory/
├── INDEX.md                      # Map of Content (MOC) — Entry point for all agents
├── CONTEXT.md                    # Core invariants, module boundaries, security rules
├── knowledge/                    # Semantic Memory: architecture maps, domain glossary
├── decisions/                    # Architectural Decision Records (ADR-NNN-*.md)
├── plans/                        # Strategic ROADMAP.md and Spec/DAG plans (SPEC-NNN-*.md)
├── episodes/                     # Episodic Memory: chronological session handoffs
└── lessons/                      # Procedural Memory: PATTERNS_AND_PITFALLS.md
```

---

## 2. Core Workflows

### Workflow A: Session Bootstrap & Context Grounding (Read Phase)
Before starting any non-trivial planning, architecture, or coding task:
1. Read [.memory/INDEX.md](file:///home/bah/GalaxyHub/.memory/INDEX.md) to locate relevant ADRs, active plans, and semantic notes.
2. Read only the targeted files in `.memory/` needed for the current task (preserve context budget).
3. If the task involves product concepts, room documents, or indexed code, query `galaxyhub_knowledge` (`list_rooms` -> `search_knowledge`) or run `npm run search -- "<query>"`.
4. Always cite retrieved sources and line numbers, and distinguish **Concept** ([Galaxy-Hub.md](file:///home/bah/GalaxyHub/Galaxy-Hub.md)) from **Implemented Code** (`src/`, `sdk/`).

### Workflow B: Recording Architectural Decisions (ADR Write Phase)
Whenever a significant technical choice is made (e.g., choosing a schema, protocol, library, or architectural boundary):
1. Create `.memory/decisions/ADR-<NNN>-<slug>.md` using [resources/templates.md](./resources/templates.md).
2. Link the new ADR under Section 2 of [.memory/INDEX.md](file:///home/bah/GalaxyHub/.memory/INDEX.md).

### Workflow C: Distilling Procedural Memory (Reflection & Lessons Phase)
Whenever a subtle bug is fixed, a test failure reveals a non-obvious constraint, or a user corrects agent behavior:
1. Formulate a concise, actionable rule (`[RULE-<CATEGORY>-<NN>]`).
2. Append it to [.memory/lessons/PATTERNS_AND_PITFALLS.md](file:///home/bah/GalaxyHub/.memory/lessons/PATTERNS_AND_PITFALLS.md) with *Context* and *Action*.

### Workflow D: Episodic Handoff (Session Close Phase)
At the completion of a major milestone or multi-agent execution:
1. Create or update `.memory/episodes/YYYY-MM-DD-<topic>.md` using the Episodic Handoff template in [resources/templates.md](./resources/templates.md).
2. Update checkboxes in [.memory/plans/ROADMAP.md](file:///home/bah/GalaxyHub/.memory/plans/ROADMAP.md) and [.memory/INDEX.md](file:///home/bah/GalaxyHub/.memory/INDEX.md).

---

## 3. Memory Hygiene & Anti-Pollution Rules

- **No Raw Dumps:** Never paste large raw terminal logs or entire source files into `.memory/`. Use clickable `file://` links with exact line ranges (`[src/retrieval.mjs](file:///home/bah/GalaxyHub/src/retrieval.mjs#L1-L50)`).
- **Zero Secrets:** Never write tokens, `.env` values, or credentials into `.memory/`.
- **Atomic Updates:** Keep [.memory/INDEX.md](file:///home/bah/GalaxyHub/.memory/INDEX.md) under 100 lines so any agent can scan the entire workspace state in one read.

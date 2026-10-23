---
name: spec-driven-planning
description: >-
  Spec-Driven Development (SDD) and architectural planning workflow for GalaxyHub.
  Use this skill when the user asks to plan a feature, design an architecture, create
  a roadmap, decompose a complex task into a DAG of executable steps, or align on
  requirements before implementation.
---

# Spec-Driven Planning & Decomposition (`spec-driven-planning`)

This skill enforces rigorous **Spec-Driven Development (SDD)**: no complex feature or architectural change is written without a verified Specification, explicit invariants, and a Directed Acyclic Graph (DAG) of atomic tasks.

---

## 1. The 5-Step Planning Workflow

### Step 1: Context & Evidence Gathering
1. Read [.memory/INDEX.md](file:///home/bah/GalaxyHub/.memory/INDEX.md), [.memory/CONTEXT.md](file:///home/bah/GalaxyHub/.memory/CONTEXT.md), and [.memory/plans/ROADMAP.md](file:///home/bah/GalaxyHub/.memory/plans/ROADMAP.md).
2. Query `galaxyhub_knowledge` (or `npm run search -- "<query>"`) to verify product requirements in [Galaxy-Hub.md](file:///home/bah/GalaxyHub/Galaxy-Hub.md) and existing behavior in `src/`.
3. Inspect target source files with `view_file` using exact line slices (Gold Context localization).

### Step 2: Ambiguity Resolution
If requirements have high-impact trade-offs (e.g., storage schema, API contract, auth model, UI vs. backend scope):
- Formulate brief, high-leverage multiple-choice questions using `ask_question` with `(Recommended)` on the best engineering option.
- Do not ask trivial questions that can be answered by reading the codebase.

### Step 3: Authoring the Specification (`SPEC-NNN`)
Write or update the specification in `.memory/plans/SPEC-<NNN>-<slug>.md` using [resources/spec-template.md](./resources/spec-template.md). Every spec MUST define:
- **Problem & Goal** (separating Concept from Current Implementation)
- **Non-Goals** (explicit scope boundaries to prevent scope creep)
- **System Contracts & Data Models** (exact JSON schemas, SQLite/PostgreSQL tables, HTTP/MCP signatures)
- **Security & Failure Modes** (tenant/room ACLs, rate/size limits, rollback/atomicity)

### Step 4: DAG Task Decomposition
Break the implementation into atomic tasks (`T1`, `T2`, ...) structured as a Directed Acyclic Graph:
- Each task must specify:
  - `Depends On`: Prerequisite task IDs (`none` for root tasks that can run in parallel).
  - `Target Files`: Exact files to create or edit (enables conflict-free multi-agent execution via [`multi-agent-orchestrator`](../multi-agent-orchestrator/SKILL.md)).
  - `Verification`: Exact test command (`npm test`, `node --test ...`) that proves the task is complete.

### Step 5: Second Brain Registration
Link the new Spec in [.memory/plans/ROADMAP.md](file:///home/bah/GalaxyHub/.memory/plans/ROADMAP.md) and [.memory/INDEX.md](file:///home/bah/GalaxyHub/.memory/INDEX.md). If the spec introduces a permanent architectural decision, also create an ADR via [`second-brain-memory`](../second-brain-memory/SKILL.md).

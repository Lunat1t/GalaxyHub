# Specification & DAG Plan Template (`.memory/plans/SPEC-NNN-slug.md`)

```markdown
# SPEC-NNN: <Feature or Subsystem Title>

- **Date:** YYYY-MM-DD
- **Status:** Draft | Approved | In Progress | Completed
- **Related ADRs:** [ADR-001](file:///home/bah/GalaxyHub/.memory/decisions/ADR-001-contextual-retrieval-architecture.md)

---

## 1. Objective & Evidence
- **User / Product Goal:** (Cite `Galaxy-Hub.md` or user request)
- **Current Codebase Baseline:** (Cite exact `src/` or `sdk/` files and lines)
- **Non-Goals:** (What is explicitly out of scope for this iteration)

---

## 2. Technical Design & Contracts
### Data Model / State
- Schema / Types:

### API / Protocol / Module Interface
- Signatures, inputs, outputs, error codes (`HttpError`, JSON-RPC codes):

---

## 3. Security, Isolation & Failure Modes
- **Tenant & Room Isolation:** How `{ tenant, room }` boundaries are enforced.
- **Input Bounds & Concurrency:** Max payload size, timeouts, concurrency limits.
- **Atomicity & Rollback:** What happens if an external provider or DB write fails mid-flight.

---

## 4. Executable Task DAG

| Task ID | Depends On | Role / Agent | Target Files | Acceptance & Verification |
| :--- | :--- | :--- | :--- | :--- |
| **T1** | `none` | Implementer | `test/...` | Failing test reproducing requirement (`Red`) |
| **T2** | `T1` | Implementer | `src/...` | Implementation passes `npm test` (`Green`) |
| **T3** | `T2` | Reviewer | Read-only | Security & invariant audit passes |
| **T4** | `T3` | Memory Curator | `.memory/...` | Update `INDEX.md`, `ROADMAP.md`, and lessons |
```

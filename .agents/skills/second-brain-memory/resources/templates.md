# Second Brain Memory Templates

## 1. ADR Template (`.memory/decisions/ADR-NNN-title.md`)

```markdown
# ADR-NNN: <Short Decision Title>

- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded by ADR-XXX
- **Context:** What problem or constraint forced this decision? Reference relevant files/lines.
- **Options Considered:**
  1. *Option A:* Pros / Cons
  2. *Option B:* Pros / Cons
- **Decision:** Clear statement of the chosen design.
- **Consequences:** Positive outcomes, trade-offs, and required follow-ups.
```

---

## 2. Episodic Handoff Template (`.memory/episodes/YYYY-MM-DD-topic.md`)

```markdown
# Episode YYYY-MM-DD: <Milestone or Task Name>

- **Date:** YYYY-MM-DD
- **Session Goal:** One-sentence summary of what was requested.
- **Key Changes & Artifacts:**
  - Modified/Created: `[file](file:///path/to/file#L1-L20)` — summary of change
  - Decisions Recorded: `[ADR-NNN](file:///home/bah/GalaxyHub/.memory/decisions/ADR-NNN.md)`
- **Verification Status:** Commands run (`npm test`, etc.) and results.
- **Open Questions / Next Steps:** Immediate next actions for the next agent session.
```

---

## 3. Procedural Lesson Entry (`.memory/lessons/PATTERNS_AND_PITFALLS.md`)

```markdown
- **[RULE-<CAT>-<NN>] <Imperative Rule Title>:**
  - *Context:* Why this matters / what failed previously.
  - *Action:* Exact check or pattern the agent must follow.
```

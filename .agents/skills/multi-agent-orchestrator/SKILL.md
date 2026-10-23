---
name: multi-agent-orchestrator
description: >-
  State-of-the-art multi-agent orchestration framework for GalaxyHub. Use this skill
  when tackling complex, multi-step engineering or research tasks that benefit from
  specialized subagents (Architect, Context Researcher, Implementation Engineer,
  Adversarial Reviewer, Memory Curator), parallel discovery, isolated workspaces,
  and structured handoffs via the Second Brain (.memory/).
---

# Multi-Agent Orchestration System (`multi-agent-orchestrator`)

This skill defines the operating topology, role specialization, workspace isolation, and handoff contracts for coordinating autonomous subagents in GalaxyHub using `define_subagent`, `invoke_subagent`, `send_message`, and `manage_subagents`.

---

## 1. Agent Swarm Topology & Specialized Roles

When orchestrating a complex task, the **Lead Orchestrator (Parent Agent)** coordinates five specialized roles. Read [references/agent-personas.md](./references/agent-personas.md) for ready-to-use `define_subagent` system prompts and configurations.

```text
                       ┌──────────────────────────────┐
                       │   Lead Orchestrator (Main)   │
                       │  Reads/Updates .memory/INDEX │
                       └──────────────┬───────────────┘
          ┌───────────────────┬───────┴────────┬───────────────────┐
          ▼                   ▼                ▼                   ▼
┌───────────────────┐ ┌───────────────┐ ┌──────────────┐ ┌───────────────────┐
│ Context Researcher│ │ System        │ │ Implementer  │ │ Adversarial       │
│ (type: research)  │ │ Architect     │ │ (type: self  │ │ Reviewer & QA     │
│ Parallel read-only│ │ Spec & DAG    │ │ or custom)   │ │ Security, Edge    │
│ Gold Context + MCP│ │ Decomposition │ │ TDD & Code   │ │ Cases & npm test  │
└───────────────────┘ └───────────────┘ └──────────────┘ └───────────────────┘
```

| Role | Recommended Subagent Type | Write Tools | Workspace Mode | Core Output |
| :--- | :--- | :--- | :--- | :--- |
| **Context Researcher** | Built-in `research` | `false` | `inherit` | Gold Context report: exact file paths, line slices, and cited MCP passages. |
| **System Architect** | Built-in `research` or custom `galaxy_architect` | `false` (or `true` for `.memory/plans/`) | `inherit` | RFC / Spec, ADR draft, and DAG task breakdown with non-overlapping file scopes. |
| **Implementation Engineer** | Built-in `self` or custom `galaxy_implementer` | `true` | `inherit` (single) or `share`/`branch` (parallel) | Tested code changes + verification output (`npm test`). |
| **Adversarial Reviewer** | Custom `galaxy_reviewer` | `false` | `inherit` | Security, invariant, and edge-case audit report with `file:line` citations. |
| **Memory Curator** | Custom `galaxy_memory_curator` | `true` | `inherit` | Updated `.memory/` (`INDEX.md`, ADRs, Episode log, Lessons). |

---

## 2. Execution Protocol (4-Phase Orchestration Loop)

### Phase 1: Parallel Discovery & Context Grounding
1. Check [.memory/INDEX.md](file:///home/bah/GalaxyHub/.memory/INDEX.md) and [.memory/CONTEXT.md](file:///home/bah/GalaxyHub/.memory/CONTEXT.md) first.
2. If the task spans multiple domains (e.g., retrieval engine + MCP protocol + SDK + product concept), launch parallel `research` subagents via a single `invoke_subagent` call with `Subagents: [...]`.
3. **Rule:** Never poll subagents in a loop. After calling `invoke_subagent`, either continue independent local work or end your turn and wait for reactive wakeup.

### Phase 2: Architectural Synthesis & DAG Partitioning
1. Synthesize findings into a concrete execution plan or Spec (see [`spec-driven-planning`](../spec-driven-planning/SKILL.md)).
2. Partition implementation work into **disjoint file sets** so parallel subagents never edit the same file concurrently.

### Phase 3: Parallel or Sequential Implementation
1. **Disjoint Files in Shared Workspace:** If Task A touches `sdk/` and Task B touches `scripts/`, invoke subagents with explicit file ownership boundaries.
2. **Competing Approaches or Risky Refactors:** Use `Workspace: "branch"` or `Workspace: "share"` in `invoke_subagent` so each subagent works in an isolated repository tree without conflicting edits.
3. Require every implementation subagent to run `npm test` before reporting completion.

### Phase 4: Adversarial Review & Second Brain Consolidation
1. Run the verification suite (`npm test`) and inspect diffs against `.memory/CONTEXT.md` invariants (tenant/room isolation, no leaked secrets, untrusted evidence handling).
2. Record new ADRs, lessons, and the episodic summary in `.memory/` via the [`second-brain-memory`](../second-brain-memory/SKILL.md) skill.

---

## 3. Subagent Prompt Contract (Mandatory Handoff Format)

Every `Prompt` passed to `invoke_subagent` MUST include these four blocks:

```markdown
1. **Objective**: Clear, measurable deliverable.
2. **Gold Context Anchors**:
   - Read `.memory/CONTEXT.md`
   - Inspect specific files/lines: `<paths>`
3. **Strict Boundaries**:
   - Allowed files to modify (or Read-Only constraint).
   - Security invariant: Never read/print `.env` secrets.
4. **Required Return Format**:
   - Summary of findings/changes with `[file](file:///abs/path#L1-L10)` links.
   - Verification command outputs (`npm test`).
   - Any discovered pitfalls for `.memory/lessons/PATTERNS_AND_PITFALLS.md`.
```

---
name: elite-dev-lifecycle
description: >-
  Full-cycle engineering, Test-Driven Development (TDD), root-cause debugging, and
  security/quality verification workflow for GalaxyHub. Use this skill whenever writing,
  refactoring, debugging, or reviewing code in the repository.
---

# Elite Development & Verification Lifecycle (`elite-dev-lifecycle`)

This skill defines the standard engineering discipline for modifying code, adding features, or fixing bugs in GalaxyHub.

---

## 1. Phase 1: Gold Context Localization (Before Any Edit)

1. **Read Memory First:** Check [.memory/CONTEXT.md](file:///home/bah/GalaxyHub/.memory/CONTEXT.md) and [.memory/lessons/PATTERNS_AND_PITFALLS.md](file:///home/bah/GalaxyHub/.memory/lessons/PATTERNS_AND_PITFALLS.md) to avoid known pitfalls.
2. **Locate Minimal Sufficient Context:**
   - Identify the exact symbols, functions, and test files involved.
   - Use `view_file` with targeted `StartLine` and `EndLine` ranges rather than reading entire directories.
3. **Baseline Test Run:**
   - Run `npm test` before making changes to confirm the baseline test suite is green.

---

## 2. Phase 2: Strict TDD Loop (`Red -> Green -> Refactor`)

### Step A: `Red` (Write or Update a Reproducing Test)
- In [test/retrieval.test.mjs](file:///home/bah/GalaxyHub/test/retrieval.test.mjs) or [test/codex.test.mjs](file:///home/bah/GalaxyHub/test/codex.test.mjs) (using Node's built-in `node:test` and `node:assert/strict`), add a focused unit or integration test covering:
  - Happy path behavior
  - Authorization / tenant-room isolation boundary
  - Malformed input / error handling
- Run `npm test` to verify the new test fails for the expected reason.

### Step B: `Green` (Minimal, Zero-Dependency Implementation)
- Implement the change using clean, modern ES Modules (`Node.js >= 22.13`).
- Respect existing architectural constraints:
  - **Zero external npm packages** unless explicitly requested and approved by the user.
  - Preserve existing comments and docstrings unrelated to your edit.
  - Ensure all SQLite writes/replacements remain atomic.
- Run `npm test` until all tests pass.

### Step C: `Refactor` & Protocol Verification
- Clean up duplication and verify edge cases.
- If MCP behavior was touched, run `npm run mcp:check`.
- If retrieval ranking or chunking was touched, run `npm run evaluate`.

---

## 3. Phase 3: Root-Cause Debugging Protocol

When investigating a failure or bug:
1. **Reproduce Deterministically:** Isolate the failing input in a `node:test` case or temporary script in the scratch directory.
2. **Trace Data Flow:** Follow the request from boundary validation ([src/server.mjs](file:///home/bah/GalaxyHub/src/server.mjs) or [src/mcp.mjs](file:///home/bah/GalaxyHub/src/mcp.mjs)) -> domain logic ([src/retrieval.mjs](file:///home/bah/GalaxyHub/src/retrieval.mjs) / [src/knowledge-reader.mjs](file:///home/bah/GalaxyHub/src/knowledge-reader.mjs)) -> provider adapter ([src/providers.mjs](file:///home/bah/GalaxyHub/src/providers.mjs) / [src/codex.mjs](file:///home/bah/GalaxyHub/src/codex.mjs)).
3. **Fix Root Cause, Never Symptoms:** Do not silence errors or weaken assertions. Ensure `HttpError` status codes and JSON-RPC error codes remain accurate.

---

## 4. Phase 4: Pre-Completion Security & Quality Checklist

Before reporting completion to the user, verify:
- [ ] `npm test` exits with code `0` (all tests pass).
- [ ] No secrets from `.env` were read into stdout or committed.
- [ ] Tenant and room ACL checks cannot be bypassed by client payload fields.
- [ ] Retrieved passages are treated as untrusted evidence.
- [ ] Any new architectural decision or lesson learned is recorded in `.memory/` via [`second-brain-memory`](../second-brain-memory/SKILL.md).

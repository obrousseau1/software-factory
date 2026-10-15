---
name: write-handoff
description: Update a spaceport shred's handoff.md in the fixed format - phase, what was done, design choices, doubts and their resolutions - then check the turn is complete. Use when a twin starts a phase or ends its turn.
---

# Write handoff

`handoff.md` is the next twin's only memory. Keep it short and factual.

## Frontmatter

Written by `shred.mjs turn`. Change only `phase:`, set to each phase as you start it. Leave
`turn`, `twin`, `challenge`, `build` as they are.

## Body

Rewrite the body each turn, keeping the doubts table's rows:

```
# Handoff

## Done
- <R-xx: what now works, which tests prove it>

## Design choices
- <choice: why>

## Doubts
| ID | Doubt | Status |
|----|-------|--------|
| D-1 | <question about the spec or design> | open |
```

- **Doubts** you raise: next free `D-<n>`, status `open`.
- **Open doubts you received**: set each status to `fixed: <how>`, `rejected: <why>` or
  `escalated: <why>` (a spec gap liftoff must take to the user). Never delete a row.

## Before you stop

From the worktree: `node "${CLAUDE_PLUGIN_ROOT}/scripts/shred.mjs" check <id> <n>`.
It checks the handoff, doubts, test lines kept, nothing written outside the worktree, on the
final turn every requirement tested and no `TODO` / `NotImplemented`, then runs every gate.
Fix every error and run it again until `ok: true`.

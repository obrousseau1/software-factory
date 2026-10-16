---
name: amend-doc
description: Create or amend a spaceport living doc (intent.md, spec.md, plan.md of a work order) and append its changelog row in the fixed format. Use whenever liftoff writes or changes a living doc; a Stop hook blocks body changes without a new row.
---

# Amend doc

Only liftoff writes living docs. Subagents return drafts or findings; liftoff applies them here.

## Create

Write the doc, then end it with:

```
## Changelog
| Date | Step | Change | Why |
|------|------|--------|-----|
| <YYYY-MM-DD> | <step> | Created | <e.g. intent confirmed by user> |
```

## Amend

1. Edit the body. Keep requirement IDs stable: never renumber or reuse; a dropped requirement is
   removed and its ID stays unused (the changelog row says why).
2. Append one row: `| <YYYY-MM-DD> | <current step> | <what changed, ≤12 words> | <why> |`.
   One row per amendment, never edit or delete earlier rows.
3. If a spec or plan changed, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/docs.mjs" check <wo-dir>`
   and fix every error before moving on.
4. **Amended after its gate** (`spec.md` or `plan.md` once docs is approved): the approval is
   void and `state.mjs step` will refuse to move on. Go back and re-earn it:
   `state.mjs step <id> docs`; a spec change → the architect revises both docs with
   `Feedback: spec changed: <the change>`; then ask the docs gate again.
   Never hand-patch around a docs check error (e.g. a new `R-xx` missing from the plan): it means
   the plan must be revised.

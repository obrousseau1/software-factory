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

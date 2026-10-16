---
name: run-gates
description: Run the repo's gate commands from .liftoff/profile.md (format, lint, typecheck, build, test) and return a fixed pass/fail table with the first error of each failure. Use when liftoff verifies a new profile, or liftoff needs to know whether the gates are green.
---

# Run gates

1. From the repo root: `node "${CLAUDE_PLUGIN_ROOT}/scripts/profile.mjs" gates`.
   It prints `{ <gate>: <command> }`. On error, return `Gates: ⛔ <error>` and stop.
2. Run every command in the printed order with Bash (timeout 10 min each). Run them all, even
   after a failure.
3. Return exactly:

```
Gates: <passed>/<total>
| Gate | Result | Evidence |
|------|--------|----------|
| <gate> | ✅ / ❌ | <❌ only: first meaningful error line, ≤200 chars> |
```

No fixes, no commentary.

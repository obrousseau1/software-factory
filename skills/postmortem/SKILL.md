---
name: postmortem
description: Write a spaceport work order's postmortem.md (what failed, which round caught it, which agent caused it, time and tokens from the ledger) and append role-tagged lessons to .liftoff/lessons.md for later work orders. Use when liftoff closes a work order after final approval.
---

# Postmortem

Input: the work-order folder `.liftoff/wo/<id>/` and, when liftoff gives it, the true cost
(`ledger.mjs cost` output). Facts only from files and that input; never guess.

## 1. Read

- `state.json`: per shred `status`, `round` (review rounds), `reviewers`, `minor`.
- `shreds/<n>/findings/r<k>-<role>.md`: every finding, its round and severity. A finding not
  raised again in the next round was fixed or rejected; a shred `escalated` kept it open.
- `ledger.md` `## Totals`: copy numbers as they are. Never add them up yourself.
- `.liftoff/lessons.md` (if any): do not repeat a lesson already there.

## 2. Write `postmortem.md`

```
# Postmortem <id>

## Outcome
<shreds landed / escalated, rounds per shred, one line>

## Failures
| Shred | Round | Caught by | Caused by | Severity | What |
|-------|-------|-----------|-----------|----------|------|

## Cost
<the ledger Totals table, copied; then the true $ total and per role, if given>

## Lessons
<the lines appended to lessons.md, or "none">

## Suggested factory changes
<changes to spaceport agents, skills or hooks; "none">
```

`Caused by` is the role whose work held the defect (usually `builder`, `architect` for a spec gap).
A finding the builder rejected with a reason still counts as caught, not as a failure.

## 3. Append lessons

Append to `.liftoff/lessons.md` (create it with `# Lessons`), one line each:

`- [<role>] <lesson, imperative, ≤20 words> (<id>)`

- `<role>`: the agent that should act differently next time: `architect`, `builder`, `reviewer`,
  `security-reviewer`. Scripts inline each role's lines into its prompt, so the tag must be exact.
- Repo-specific only (this codebase, its conventions, its pitfalls). A lesson about how spaceport
  itself works goes under `Suggested factory changes` instead.
- Only from a failure that cost a round, a refused build or an escalation. No failure → no lesson.

## Return

`Postmortem: <n> failures, <n> lessons, <n> suggested factory changes`, then each suggestion on
its own line.

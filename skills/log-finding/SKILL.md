---
name: log-finding
description: Write a spaceport validator's findings file for one round in the fixed format - one graded row per finding (Critical / Major / Minor) - and return the short validator report. Use when a spaceport validator reviews a shred's diff.
---

# Log finding

## Inputs

The prompt gives the repo, the worktree, the diff (`diff-r<k>.patch`), `handoff.md`, the findings file to
write and, from round 2, the earlier findings folder. The spec is
`<repo>/.liftoff/wo/<id>/spec.md`, the shred row is in `plan.md`, conventions in
`<repo>/.liftoff/profile.md`. Read the diff first, then the files it touches in the worktree.

## Severity

| Severity | Means | Effect |
|----------|-------|--------|
| Critical | Wrong behaviour, data loss, exploitable flaw, a requirement not done | Blocks the round |
| Major | Requirement clause missed, real risk, convention broken in a way that will cost | Blocks the round |
| Minor | Worth knowing, not worth another round | Logged, shown at final |

Grade honestly: no Major for taste. Only the diff is in scope; existing code only where the diff
makes it wrong.

## Earlier rounds

`handoff.md` Doubts holds earlier findings (`F<k>-<i>`) and how the twins resolved them. Re-raise one
only if its fix is wrong or its `rejected:` reason is; say why in the row.

## File

Write the findings file once, with exactly this table (no rows = nothing found):

```
# Findings: <your role>, round <k>

| # | Severity | Where | Finding |
|---|----------|-------|---------|
| 1 | Major | src/cart.ts:42 | <what is wrong, and what right looks like> |
```

One row per finding; `Where` is `path:line` in the worktree; no `|` inside a cell.

**Removing test lines.** Twins may never delete a test line on their own. When a Critical / Major
finding needs one gone (duplicate, irrelevant, or a weak assertion to replace), license it: after
the table, quote the exact lines to delete, path relative to the worktree, `#` = the finding's row.

````
## Remove

### 1 tests/cart.test.ts
```ts
it('R-01 cart loads', () => {
  expect(true).toBe(true);
});
```
````

Only the quoted lines may go; copy them exactly.

## Report

End with exactly:

```
Status: done | blocked
Findings: <n> Critical, <n> Major, <n> Minor
Notes: <at most 3 short lines>
```

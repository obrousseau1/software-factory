---
name: log-finding
description: Write a spaceport reviewer's findings file for one round in the fixed format - one row per finding, graded by a strict rubric (Critical / Major / Minor) - and return the short reviewer report. Use when a spaceport reviewer reviews a shred's diff.
---

# Log finding

## Inputs

The prompt gives the repo, the worktree, the diff (`diff-r<k>.patch`), the findings file to write
and, from round 2, the earlier findings folder and the builder's replies. The spec is
`<repo>/.liftoff/wo/<id>/spec.md`, the shred row is in `plan.md`, conventions in
`<repo>/.liftoff/profile.md`. Read the diff first, then the files it touches in the worktree.

## Severity

Blocking findings cost a whole fix round. Only these block:

| Severity | Only for | Effect |
|----------|----------|--------|
| Critical | Data loss, or a flaw exploitable as written | Blocks the round |
| Major | A requirement clause broken or not tested; new UI not accessible (label, keyboard, focus); a security risk under plausible use; a test that cannot fail | Blocks the round |
| Minor | Everything else: naming, style, design taste, scope creep, missing edge case the spec does not ask for, a unit test where a behaviour test would do | Logged, shown at final |

Not on that list → Minor, however strongly you feel. Only the diff is in scope; existing code only
where the diff makes it wrong.

## Earlier rounds

Earlier findings (`F<k>-<i>`) are in the earlier findings folder; the builder's replies say which it
fixed and which it rejected, and why. Re-raise one only if its fix is wrong or its rejection reason
is; say why in the row.

## File

Write the findings file once, with exactly this table (no rows = nothing found):

```
# Findings: <your role>, round <k>

| # | Severity | Where | Finding |
|---|----------|-------|---------|
| 1 | Major | src/cart.ts:42 | <what is wrong, and what right looks like> |
```

One row per finding; `Where` is `path:line` in the worktree; no `|` inside a cell.

**Removing test lines.** The builder may never delete a committed test line on its own. When a Critical / Major
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

Only the quoted lines may go; copy them exactly. Close every fence: a malformed block makes liftoff re-spawn you.

## Report

End with exactly:

```
Status: done | blocked
Findings: <n> Critical, <n> Major, <n> Minor
Notes: <at most 3 short lines>
```

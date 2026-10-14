# Shred

Check the shreds deterministically, then the user approves plan + shreds together.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" step <id> shred`.
2. **Check**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/docs.mjs" check <wo>`: every `R-xx` in exactly
   one shred, dependencies on earlier shreds only, valid UX level. Errors → re-spawn
   `spaceport:architect` with `Mode: plan. Work order: <wo>. Feedback:` and the errors, amend
   `plan.md` with `spaceport:amend-doc`, check again. After 2 failed re-spawns, reply ⚠️ and ask
   with `AskUserQuestion`: fix `plan.md` by hand then re-check, or stop.
3. **Gate** `[gate <id> shred]`: ask with `AskUserQuestion` to approve the plan and its shreds. Preview: the Shreds
   table and the Decisions table; the question names `plan.md`. Options: Approve, Change.
   Change → re-spawn the architect with the user's words as `Feedback:`, amend, then step 2.
4. **Approved**: enter the work step.

# Plan

The architect drafts how to build the spec and splits it into shreds, in one `plan.md`. No gate
here: the user approves the plan and its shreds together at the end of the shred step.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" step <id> plan`.
2. **Spawn** `spaceport:architect` with `Mode: plan. Work order: <wo>.` Handle its report as in
   the specs step: relay `questions` (max 2 rounds), ⛔ on `blocked`.
3. **Draft** → write `<wo>/plan.md` with `spaceport:amend-doc` (Create, step `plan`).
4. Enter the shred step.

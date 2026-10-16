# Work

One builder builds one shred at a time in its own worktree. Hooks keep it in the worktree, protect
committed tests, and block its stop until the build is complete.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" step <id> work`.
2. Take the first shred in `plan.md` not yet in `state.json` `shreds`.
3. **Open**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/shred.mjs" open <id> <n>` (Bash timeout 10 min:
   it runs the gates). `Base is red` → reply ⛔ and ask with `AskUserQuestion`: fix the repo, then
   retry, or stop. Never weaken a gate.
4. **Build**: spawn the printed `agent` with the printed `prompt`, verbatim. Keep the agent id the
   result gives: review fixes go back to it.
5. **Report** `blocked` → reply ⛔ with its notes. Otherwise run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/shred.mjs" built <id> <n>` (timeout 10 min).
   - `built` → enter the review step.
   - `not complete` → `SendMessage` the builder `Fix first:` and the errors, then step 5 again.
     Refused a second time → reply ⛔ and ask with `AskUserQuestion`: retry, or stop the shred.

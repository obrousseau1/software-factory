# Work

Twins build one shred at a time in its own worktree, turn by turn (BUILD → CHALLENGE → REFACTOR).
`shred.mjs` plans each turn; hooks enforce phases and block a twin's stop until its turn is complete.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" step <id> work`.
2. Take the first shred in `plan.md` not yet in `state.json` `shreds` (none left → validate step).
3. **Open**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/shred.mjs" open <id> <n>` (Bash timeout 10 min:
   it runs the gates). `Base is red` → reply ⛔ and ask with `AskUserQuestion`: fix the repo, then
   retry, or stop. Never weaken a gate.
4. **Turn**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/shred.mjs" turn <id> <n>` (timeout 10 min).
   - `done: true` → the shred is built: enter the validate step.
   - Otherwise spawn `spaceport:twin` with the printed `prompt`, verbatim. Then step 4 again.
5. **Turn refused** (`not complete`): re-spawn `spaceport:twin` once with the same prompt plus
   `Fix first:` and the errors. Refused again → reply ⛔ and ask with `AskUserQuestion`: retry,
   or stop the shred.
6. **Twin report**: `escalated` doubts → ask the user with `AskUserQuestion`; a spec change goes
   through `spaceport:amend-doc` (and back to its gate). `blocked` → reply ⛔ with its notes.

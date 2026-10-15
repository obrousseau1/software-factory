# Validate

Validators check a built shred in parallel; `validate.mjs` reads their findings and decides. Max 3
rounds; a hook denies twin and validator spawns once a shred is escalated.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" step <id> validate`.
2. **Round**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" round <id> <n>`. A `warnings` entry
   → mention it with ⚠️ in your next reply.
3. Spawn every printed `agent` with its `prompt`, verbatim, **in one message** (parallel).
4. **Verdict**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" verdict <id> <n>`.
   - `Re-spawn these validators` → re-spawn only those, once, same prompt. Fails again → reply ⛔
     and ask with `AskUserQuestion`: retry, or stop.
   - `pass: true` → the shred landed on `spaceport/<id>`. More shreds in `plan.md` → `state.mjs step
     <id> work`, work step 2. None left → final step.
   - `pass: false`, `escalated: false` → findings are now open `F` doubts in `handoff.md`.
     `state.mjs step <id> work`, then work step 4 (`shred.mjs turn` plans a fix turn).
   - `escalated: true` → step 5.
5. **Escalate**: reply ⛔ with the open findings (one line each, `[severity] where: finding`) and ask
   with `AskUserQuestion`:
   - **Stop**: the shred stays escalated, its worktree kept for inspection. The work order halts.
   - **Amend spec**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/shred.mjs" drop <id> <n>`, then
     `spaceport:amend-doc` on `spec.md` with the user's change; it sends you back to the specs gate.

Never edit findings, never skip a validator, never decide a finding yourself: the twins fix or
reject it in the fix turn, and escalate spec gaps (work step 6).

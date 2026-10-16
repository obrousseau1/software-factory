# Review

The reviewer checks a built shred; the security reviewer joins when the diff touches a sensitive
path. `review.mjs` reads their findings and decides. Max 2 rounds; a hook denies builder and
reviewer spawns once a shred is escalated.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" step <id> review`.
2. **Round**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/review.mjs" round <id> <n>`. A `warnings` entry
   → mention it with ⚠️ in your next reply.
3. Spawn every printed `agent` with its `prompt`, verbatim, **in one message** (parallel). Round 2:
   append `Builder replies:` and the builder's `Findings:` line.
4. **Verdict**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/review.mjs" verdict <id> <n>`.
   - `Re-spawn these reviewers` → re-spawn only those, once, same prompt. Fails again → reply ⛔
     and ask with `AskUserQuestion`: retry, or stop.
   - `pass: true` → the shred landed on `spaceport/<id>`. More shreds in `plan.md` → `state.mjs step
     <id> work`, work step 2. None left → final step.
   - `pass: false`, `escalated: false` → `state.mjs step <id> work`, `SendMessage` the printed `fix`
     to the shred's builder, verbatim, then work step 5. Builder id unknown (new session) → spawn
     `spaceport:builder` with `Work order: <id>. Shred <n>. Repo: <repo>. Worktree: <worktree>.` and the `fix`.
   - `escalated: true` → step 5.
5. **Escalate**: reply ⛔ with the open findings (one line each, `[severity] where: finding`) and ask
   with `AskUserQuestion`:
   - **Stop**: the shred stays escalated, its worktree kept for inspection. The work order halts.
   - **Amend spec**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/shred.mjs" drop <id> <n>`, then
     `spaceport:amend-doc` on `spec.md` with the user's change; it sends you back to the docs gate.

Never edit findings, never skip a reviewer, never decide a finding yourself: the builder fixes or
rejects it in the fix round.

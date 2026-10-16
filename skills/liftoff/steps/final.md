# Final

Every shred landed on `spaceport/<id>`. The user approves the result; nothing is pushed.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" step <id> final`.
2. **Summary**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/review.mjs" summary <id>`.
3. **Gate** `[gate <id> final]`: ask with `AskUserQuestion` to approve the work order. Preview: one
   line per shred (`<n> <title>: <rounds> rounds`), then every Minor finding
   (`[r<k> <role>] where: finding`), then the branch. Options: Approve, Change.
   - Change → ask what; a spec change goes through `spaceport:amend-doc` (back to its gate).
4. **Approved**: run the `spaceport:postmortem` skill on the work order.
5. **Roadmap** (`.liftoff/roadmap.md` exists): tick this work order's item. An unticked item left →
   ask with `AskUserQuestion`: Start "<next item>" once `spaceport/<id>` is merged into the current
   branch (`state.mjs new "<next item>"`, then intent; size `feature`), or Stop.
6. Reply ✅ naming the branch `spaceport/<id>` (the user pushes and opens the PR) and the lesson
   count. Suggested factory changes → `Decision:` line: the user applies them to the plugin.

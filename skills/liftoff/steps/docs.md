# Docs

The architect turns the intent into `spec.md` (testable `R-xx`, each with its `Test:` line) and
`plan.md` (approach + shreds) in one pass. You relay its questions; the user approves both together.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" step <id> docs`.
2. **Spawn** `spaceport:architect`. Prompt: `Work order: <wo>.` plus, when you have them,
   `Answers:` (each question, its options, and the user's answer) or `Feedback:` (gate changes or
   check errors).
3. **Report**:
   - `questions`: ask them with `AskUserQuestion`, one question each, its options with the
     recommended one first. Re-spawn with `Answers:`. After 2 question rounds, add
     `No more questions: decide and record in Decisions.`
   - `draft`: go to step 4.
   - `blocked`: reply ⛔ with its notes.
4. **Write** `<wo>/spec.md` and `<wo>/plan.md` from the draft with `spaceport:amend-doc` (Create,
   step `docs`; Amend on a revision).
5. **Check**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/docs.mjs" check <wo>`: every `R-xx` has a
   `Test:` line and sits in exactly one shred, dependencies on earlier shreds only, valid UX level.
   Errors → re-spawn with them as `Feedback:`, amend, check again. After 2 failed re-spawns, reply
   ⚠️ and ask with `AskUserQuestion`: fix the docs by hand then re-check, or stop.
6. **Gate** `[gate <id> docs]`: ask with `AskUserQuestion` to approve spec and plan. Preview: each
   `R-xx` title with its `Test:` line, the Shreds table, and both Decisions tables; the question
   names both files to read in full. Options: Approve, Change. Change → re-spawn with the user's
   words as `Feedback:`, then step 4.
7. **Approved**: enter the work step.

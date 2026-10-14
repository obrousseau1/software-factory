# Specs

The architect turns the intent into testable `R-xx` requirements. You relay its questions.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" step <id> specs`.
2. **Spawn** `spaceport:architect`. Prompt: `Mode: spec. Work order: <wo>.` plus, when you have
   them, `Answers:` (each question, its options, and the user's answer) or `Feedback:` (gate changes or check
   errors).
3. **Report**:
   - `questions`: ask them with `AskUserQuestion`, one question each, its options with the
     recommended one first. Re-spawn with `Answers:`. After 2 question rounds, add
     `No more questions: decide and record in Decisions.`
   - `draft`: go to step 4.
   - `blocked`: reply ⛔ with its notes.
4. **Write** `<wo>/spec.md` from the draft with `spaceport:amend-doc` (Create, or Amend on a
   revision). Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/docs.mjs" check <wo>`; errors → re-spawn
   with them as `Feedback:`.
5. **Gate** `[gate <id> specs]`: ask with `AskUserQuestion` to approve the spec. Preview: each `R-xx` title and the
   Decisions table; the question names the file to read in full. Options: Approve, Change.
   Change → re-spawn with the user's words as `Feedback:`, then step 4.
6. **Approved**: enter the plan step.

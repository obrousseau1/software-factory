# Intent

Shape what the user wants, before any solution. `<wo>` is the work-order folder, `<id>` its id.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" step <id> intent`.
2. **Shape** with `AskUserQuestion`, at most 4 questions per round: the problem, who has it, the
   observable outcome, what is out of scope. Offer concrete options drawn from the idea and the repo.
   Stop asking once each section of [the template](../templates/intent.md) has a clear answer.
3. **Facts**: for anything about the existing code, spawn `spaceport:explorer` with a precise
   question. Put what matters, with `path:line`, under Context. No design yet: that is the architect's.
4. **Size**:
   - `feature`: changes this repo; one work order.
   - `app`: a new standalone product. Only in an empty repo (`scaffold.mjs empty` prints `true`);
     otherwise reply ⚠️ asking to run liftoff in an empty repo, and stop.
     - Ask with `AskUserQuestion` for the stack (`dotnet-react-vite`, `maui`) and a PascalCase name.
     - Write `.liftoff/roadmap.md`: `# Roadmap` then one `- [ ] <one-line idea>` per work order, in
       order; the first is the walking skeleton (builds, one screen/endpoint, one passing test).
     - Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs" run <stack> <Name>`, then invoke
       `spaceport:run-gates`. A failure or any ❌ → reply ⛔ with the error, and stop.
     - This work order is roadmap item 1: the intent's Outcome is the skeleton; later items go
       under Out of scope.
5. **Gate** `[gate <id> intent]`: ask with `AskUserQuestion` to approve the intent; put the filled
   template in the option preview. Options: Approve, Change. On a change, apply it and ask again.
6. **Approved**: write `<wo>/intent.md` from the template with the `spaceport:amend-doc` skill
   (Create, step `intent`), then enter the specs step.

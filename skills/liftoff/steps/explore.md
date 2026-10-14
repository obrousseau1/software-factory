# Explore

Runs once per repo, when `.liftoff/profile.md` is missing. Up to 2 re-spawns in total.

1. **Spawn** `spaceport:profiler` with the Agent tool. Prompt:
   `Profile pass. Repo root: <cwd>. Profile: .liftoff/profile.md.` On a retry, append
   `Failures:` and the errors or the gates table.
2. **Check**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/profile.mjs" check`. Errors → retry (step 1).
3. **Gates**: invoke `spaceport:run-gates`. Any ❌ → retry (step 1). The profiler then lists in
   `Red:` the gates that fail because the repo is red, not because the command is wrong. Don't
   retry those: reply ⚠️ naming them, and ask with `AskUserQuestion`: fix the repo then re-check,
   or accept the profile with those gates red.
4. **Out of retries**: reply ⚠️, and ask with `AskUserQuestion`: fix the toolchain or profile by
   hand then re-check, or accept the profile as is.
5. **`stack: other`**: ask with `AskUserQuestion` to confirm the profile. The status line names
   the proposal folder `.liftoff/proposals/<shape>/` to adopt into the plugin.
6. Profile valid and gates green (or accepted) → enter the next step.

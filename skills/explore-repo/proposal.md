# Unknown-shape proposal

The repo matched no stack. Draft what the factory needs to know this shape from now on.

Shape name: kebab-case of the main language + framework (e.g. `go`, `python-django`).
Write into `.liftoff/proposals/<shape>/`:

| File | Content |
|------|---------|
| `stack.md` | A cue file in the same layout as `stacks/*.md`: Match, Defaults, test-globs, ui-globs, Watch |
| `fixture.md` | The smallest repo of this shape: a file tree, then each file's full content. A few files only |
| `expected-profile.md` | The profile you would write for that fixture |
| `prompt.md` | Eval prompt, same wording as the plugin's `evals/profiler-<stack>/case.yaml` prompt |

Base all four on this repo, but strip anything project-specific.

To adopt (done by a human in the plugin repo): `stack.md` → `skills/explore-repo/stacks/<shape>.md`
plus a row in the skill's stack table; fixture → `evals/profiler-<shape>/fixture/`; `prompt.md` and
`expected-profile.md` → `evals/profiler-<shape>/case.yaml` graders +
`test/expected-profiles/profiler-<shape>.md` (kept out of `evals/` so the profiler never sees it).

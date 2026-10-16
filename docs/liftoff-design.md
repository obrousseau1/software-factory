# Liftoff — software factory design

Liftoff turns a one-line idea into reviewed, tested, merged-ready code in any repo, through a fixed
line of Claude Code agents. Goal: **consistent quality**, not speed or autonomy.

Status: built through milestone 9 (lean line); its manual end-to-end run is pending.

---

## 1. Principles

1. **No agent grades its own work.** Makers and checkers are always separate contexts.
2. **Deterministic over persuasive.** Rules that matter are enforced by hooks, not prompt wording.
3. **Progressive disclosure.** Nothing is loaded until the current step needs it.
4. **Portable.** Installed on any repo; the repo is learned, never assumed.
5. **Short answers to the human.** Status, decision needed, next. Nothing else.
6. **Traceable.** Every requirement has an ID; every ID has a test; every doc change has a changelog entry.

---

## 2. Lifecycle

```
 idea ─▶ 1 INTENT ✋ ─▶ 2 DOCS ✋ ─▶ 3 WORK ⇄ 4 REVIEW ─▶ 5 FINAL ✋
                                  (per shred, ≤2 rounds)
                                   round 2 fails ─▶ ✋ escalate
```

| # | Step | Who | Output | Human gate |
|---|------|-----|--------|-----------|
| 0 | Explore *(first run on a repo only)* | profiler | `.liftoff/profile.md` | — |
| 1 | Intent | liftoff ⇄ you, explorer on demand | `intent.md` + size verdict | ✋ interactive |
| 2 | Docs | architect | `spec.md` (`R-xx`, each with a `Test:` line) + `plan.md` (approach + shreds) | ✋ approve both |
| 3 | Work | builder | code + tests in the shred's worktree | ✋ only on escalation |
| 4 | Review | reviewer (+ security reviewer on sensitive paths) | findings | ✋ only on escalation |
| 5 | Final approval | liftoff → you | branch + summary | ✋ approve |

**Sizing (step 1).** Liftoff decides:
- **Feature** → one work order on the current repo.
- **App** → empty repo only. Repo scaffolded from a stack template (green base, committed), then N
  work orders listed in `.liftoff/roadmap.md`. The first is always a walking skeleton (builds, one
  screen/endpoint, one passing test); final approval offers the next item.

**Design round-trip (step 2).** Subagents cannot ask the user. The architect's first spawn returns
options, a recommendation and open questions; liftoff asks them with `AskUserQuestion`, then re-spawns it
with the answers to draft spec and plan in one pass (max 2 question rounds). `scripts/docs.mjs` checks a
`Test:` line per requirement and shred coverage before the joint gate.

**Review loop (steps 3-4).** Reviewers run once the builder's shred passes `shred.mjs built`. Blocking
findings go back to the **same builder** (`SendMessage`, warm context). Max **2 rounds**; still failing →
liftoff halts that shred and escalates with the open findings.

---

## 3. Roles

Liftoff is the **main session**, not a subagent. Everything else is a subagent shipped by the plugin.

| Agent | Job | Writes | Model |
|-------|-----|--------|-------|
| **liftoff** (main) | Talks to you, routes work, owns state, amends living docs, manages worktrees | `.liftoff/**` | session model |
| **explorer** | Answers "what exists?" about the code | nothing | haiku |
| **profiler** | First run on a repo: writes the profile; stack proposal for unknown shapes | `profile.md`, `proposals/**` | sonnet |
| **architect** | Brainstorms options, drafts spec + plan (with shreds) in one pass | nothing — returns drafts to liftoff | opus |
| **builder** | Senior programmer; builds a whole shred test-first, then fixes review findings | code + tests in its worktree | sonnet |
| **reviewer** | Spec conformance, test relevance, standards, UX at the plan's level (§5) | its findings file | sonnet |
| **security-reviewer** | Vulnerabilities, secrets, unsafe patterns; only when the diff touches `sensitive-globs` | its findings file | opus |

---

## 4. Builder

One spawn per shred. The prompt names the shred's requirements and worktree; the builder reads the
spec, the plan row and the profile, then goes red → green → refactor per requirement.

- Each requirement's `Test:` line names the test file and what to assert. Behaviour tests first (what
  the user experiences, edge cases they hit, errors they see). No requirement tags in code or tests:
  `spec.md` holds the traceability. Each test must fail without the code it covers.
- Hooks (§7) keep it in the worktree, protect committed test lines, and block its stop until the build
  is complete (gates green, no `TODO`, each automated `R-xx`'s `Test:` file changed).
- `shred.mjs built` re-checks after it returns (a dropped block is caught here), commits, marks the shred
  `built`. Refused → liftoff sends the errors back to the same builder once.
- **Fix round.** Blocking review findings come back as one `SendMessage` to the same builder (verified:
  same `agent_id`, hooks fire, warm cache). It fixes or rejects each `F<k>-<i>` with a reason. A new
  session has lost the agent id → a fresh builder gets the same message.

Why not twins (M4-M8): four benchmarks showed the BUILD → CHALLENGE → REFACTOR rotation cost 3-6× more
and took 4-6× longer than one agent, with no better real-defect catch; most of its blocking findings were
test bloat its own CHALLENGE phase created.

---

## 5. Review

- Reviewers run **in parallel**, **read-only**, against the shred's diff (`review.mjs round` writes it).
  The reviewer always; the security reviewer only when the diff touches profile `sensitive-globs`
  (missing key → always, `none` → never). The set is stored in the shred at round start.
- Each writes its own findings file per round (`findings/r<k>-<role>.md`, `log-finding` skill).
  `review.mjs verdict` reads them; liftoff never transcribes.
- **Severity rubric** (log-finding). Critical: data loss, or exploitable as written. Major: a
  requirement clause broken or untested; new UI not accessible; a security risk under plausible use; a
  test that cannot fail. **Everything else is Minor** (naming, taste, scope creep, a unit test where a
  behaviour test would do). Critical and Major block the round; Minor is shown at final approval.
- A blocking finding may license deleting test lines: the reviewer quotes them under `## Remove`; in the
  fix round only those lines may go (hooks subtract them). A malformed block → the reviewer is re-spawned.
- Clean round → the shred fast-forwards into the work-order branch `spaceport/<id>`; its worktree is removed.
- Round 2 still failing → shred `escalated`; the user picks Stop (worktree kept) or Amend spec
  (`shred.mjs drop`, back to the docs gate). Final approval pushes nothing: the user opens the PR.

**UX level.** The architect sets it per shred in `plan.md`; the reviewer gets it in its prompt:

| Level | Reviewer does |
|-------|----------------|
| `none` | Skips UX |
| `simple` | Reads the UI code only; no Playwright |
| `deep` | *(deferred: runs as simple)* Playwright: launch the app, exercise each UI criterion, screenshot each |

---

## 6. Work-order folder

```
.liftoff/
  profile.md                  stack, architecture, gate commands, conventions (profiler)
  lessons.md                  fed after every work order (§10)
  roadmap.md                  app only: one checklist item per work order (liftoff)
  wo/<nnn-slug>/
    state.json                step, shred statuses, round counters, worktree paths
    intent.md                 ┐
    spec.md                   ├ living docs — amended only by liftoff, each ends with ## Changelog
    plan.md                   ┘
    shreds/<n>/diff-r<k>.patch    shred diff reviewers read (review.mjs round)
    shreds/<n>/findings/r<k>-<role>.md
    ledger.md                 time + tokens per subagent run (hook-written)
    postmortem.md
    .changelog.json           body hash + row count per living doc (changelog hook)
  gates-green.json            gate cache: keys of trees + commands already green (gates.mjs)
```

**Living docs.** Liftoff updates them as work reveals new facts. Each change appends a row:

```
## Changelog
| Date | Step | Change | Why |
```

**Requirement IDs.** `spec.md` numbers every requirement `R-01`, `R-02`… each ending with a
`- Test: automated — <file>: <assertion>` or `- Test: manual — <how>` line. Tests reference the ID they
cover (name, attribute or comment, per stack profile).

---

## 7. Hooks (deterministic enforcement)

All hooks are **plugin-level** (`hooks/hooks.json`), written in **Node.js**, and read `profile.md` for
stack-specific commands.

**`agent_type`.** Every hook receives a JSON description of the event. When a subagent acts, it includes
`agent_type`: the agent's name. Absent = liftoff (main session). Plugin components are namespaced
under the plugin name, so the builder is `spaceport:builder`; hooks still match the bare form too.

**Agent names are provisional.** A name is the agent file's `name` field. Hooks read names from one
module (`scripts/roles.mjs`), and the static checks (§11b) flag any dangling reference, so a rename is
one file plus the references the checks list.

| Rule | Event | Applies to | Check |
|------|-------|-----------|-------|
| Read-only checkers | PreToolUse `Edit\|Write\|NotebookEdit` | explorer, profiler (except `profile.md`, `proposals/**`), architect, reviewers | Deny; fails closed |
| Living docs owned by liftoff | PreToolUse `Edit\|Write` on `intent/spec/plan.md` | any subagent | Deny |
| Changelog required | Stop | liftoff | Living doc body changed since last snapshot without a new changelog row → block |
| Builder writes | PreToolUse `Edit\|Write` | builder | `guard-builder`: path outside the active shred's worktree → deny; removing a committed test line (multiset vs `HEAD`; test files = profile `test-globs`) → deny unless a reviewer licensed it. Bash is not parsed: the build check flags main-repo changes. Fails closed |
| Build complete | SubagentStop | builder | `guard-builder` → `shred.mjs` checkBuild: no committed test line removed, no main-repo change, no `TODO`/`NotImplemented` in the diff, the test file each automated shred `R-xx`'s spec `Test:` line names changed, gates green (cached by tree hash, 25-min total budget so the 30-min hook timeout never fails it open). Blocks ≤3 per build; `shred.mjs built` refuses until it passes. Fails open |
| Human gates | PostToolUse `AskUserQuestion` | liftoff | Question tagged `[gate <id> <gate>]` answered `Approve…` → approval + hash of each gated doc in `state.json`; every answer logged to `gates.log`. `state.mjs step` refuses a step whose earlier gates are unapproved or whose docs changed since |
| Script-owned state | PreToolUse `Edit|Write` | everyone, liftoff included | `state.json`, `gates.log`, `.changelog.json`, `ledger.md` → deny |
| Round cap | PreToolUse `Agent` | everyone | `guard-spawn`: builder only while a shred is in work, reviewers only while one is reviewing; escalated shred → deny. No work order in the repo → pass. A `SendMessage` resume is not a spawn: the builder hooks still apply |
| Reviewer writes | PreToolUse `Edit|Write` | reviewers | Only its own `findings/r<k>-<role>.md` |
| Liftoff writes no code | PreToolUse `Edit|Write` | liftoff | Target inside a shred worktree not yet landed → deny |
| Ledger | SubagentStop | all | `ledger.mjs`: sum token usage (last entry per message id) + elapsed time (first → last entry) from `agent_transcript_path`; one row per agent id (a resumed builder's row is rewritten) in the work order with a shred in progress, else the latest not yet final-approved. Fails open. `ledger.mjs cost <id>` reconciles output and $ with each session's `cost-state` (`costs.mjs`) |

**Gate cache.** `gates.mjs` `runGates` keys a run on the worktree's content (a temp-index `git add -A` +
`write-tree`, untracked files included, the real index untouched) plus the gate commands, and skips
gates already green for that key (`.liftoff/gates-green.json`, last 20). Red is never cached: it may be
flaky. Gitignored files are not part of the key, so installed dependencies are not either: a changed
`node_modules` on the same tree is a cache hit. Fine while `setup` is lockfile-exact; add the lockfile hash
to the key if flakiness shows up.

---

## 8. Skills

Small, single-purpose, loaded on demand by agents through the Skill tool.

| Skill | Used by | Does |
|-------|---------|------|
| `liftoff` | main | Entry point: thin step map; loads `steps/<step>.md` on entering a step |
| `explore-repo` | profiler | Writes / refreshes `profile.md` |
| `amend-doc` | liftoff | Edit a living doc + append changelog row |
| `draft-docs` | architect | Brainstorm questions, draft `spec.md` + `plan.md` from templates in one pass |
| `run-gates` | liftoff | Run profile's lint, typecheck, test; summarize |
| `log-finding` | reviewers | Write the round's findings file with the severity rubric (§5) |
| `postmortem` | liftoff | Write `postmortem.md` (with the true $ from `ledger.mjs cost`), feed `lessons.md` |

Each agent ends with a fixed short report format in its own definition.

---

## 9. Progressive disclosure

- `liftoff/SKILL.md` is a **map**: steps, gates, where each step's instructions live. Each
  `steps/*.md` loads only when that step starts.
- Agent definitions are **short**: role, boundaries, which skills to call. They do not inline skill
  content (no `skills:` preload).
- `profile.md` and `lessons.md` are read only by the agents and steps that need them.
- Subagents return a short fixed report; full output stays on disk. Scripts print compact JSON.
  Liftoff's context grows by summaries only.

---

## 10. Memory

After final approval, liftoff runs `postmortem` (prompt-only, no hook):
- What failed, which round caught it, which agent caused it, time/tokens from the ledger.
- Durable lessons appended to `.liftoff/lessons.md` (repo-specific), one line each, tagged with the role
  that should act differently: `- [builder] …`. Scripts inline each role's lines into the builder and
  reviewer prompts they build; the architect reads its lines in `draft-docs`.
- Lessons that are factory-wide are listed as suggested changes to the plugin (agents, skills, hooks)
  for you to accept.

---

## 11. Portability

**Delivered as a Claude Code plugin named `spaceport`.** The `software-factory` repo is both the plugin
and its own marketplace. Entry point: `/spaceport:liftoff`. Node.js is a prerequisite on every repo.

```
software-factory/
  .claude-plugin/plugin.json
  .claude-plugin/marketplace.json
  agents/        explorer.md, profiler.md, architect.md, builder.md, reviewer.md, security-reviewer.md
  skills/        liftoff/ (SKILL.md + steps/), amend-doc/, run-gates/, …
  hooks/         hooks.json
  scripts/       *.mjs (hook implementations)
  templates/     stacks/dotnet-react-vite/, stacks/maui/
  install/       install.mjs
```

**Install script** (`node install/install.mjs <repo>`):
1. Registers the marketplace and enables the plugin in `<repo>/.claude/settings.json`.
2. Creates `.liftoff/` skeleton.
3. Prints next step: run liftoff; first run triggers the profiler.

**Profile.** The profiler writes `.liftoff/profile.md`: flat frontmatter keys
(`stack`, `setup`, `gate-format|lint|typecheck|build|test`, `run`, `test-globs`, `ui-globs`, optional
`sensitive-globs`; `none` = n/a) + architecture, folder
roles, conventions. The profiler infers without running anything; liftoff runs the gates (`run-gates`) and
re-spawns the profiler on failure (max 2). Known stacks are cue files (`skills/explore-repo/stacks/`), each
with a fixture + eval; an unknown repo gets `stack: other` and a proposal in `.liftoff/proposals/<shape>/`.

**Migrating a profile to M9.** A profile written before M9 has no `sensitive-globs`, so the Opus
security reviewer runs every round there (safe, no saving). Add the key by hand, or delete the profile
and let the profiler rewrite it. Its `req-tag` key is now ignored.

**Stacks** (for empty repos only): `.NET + React/TypeScript/Vite`, `MAUI` (Windows target only).
Each template is a `recipe.json` (shell commands running the official generators, plus regex
replaces) and a pre-filled `profile.md`; `scripts/scaffold.mjs` runs it and commits. Generators
track the installed SDK; they need network.

**Worktrees.** Used whenever possible: one per shred, created and removed by liftoff
(`git worktree`, sibling folder `<repo>.spaceport/`). The built-in agent `isolation: worktree` is not
used — it branches from the default branch and is per spawn, but a shred's fix rounds reuse its worktree.
One shred at a time (parallel shreds out of scope).

---

## 11b. Testing the factory itself

Three layers, from cheap and deterministic to costly and statistical.

| Layer | Tests | How | When |
|-------|-------|-----|------|
| **Scripts** | Every hook and the install script | `node:test` (built in, no deps). Feed a fixture hook-input JSON on stdin, assert exit code / decision JSON. Fixture repos for profile-dependent hooks | Every commit |
| **Static checks** on agents + skills | Frontmatter valid (`name`, `description`, `tools`, `model`); every file a skill or step references exists; every skill an agent names exists; every agent name used by hooks exists; no `skills:` preload; size budget per `SKILL.md` / agent file (enforces progressive disclosure) | `node:test` over the plugin folder | Every commit |
| **Behavioural evals** for agents + skills | Scenario per agent against a fixture repo, asserting on artifacts: profiler → correct gate commands in `profile.md`; architect → spec + plan with `Test:` lines; reviewer → catches each seeded defect (spec, test, UX) as blocking; security reviewer → the injection as Critical; postmortem; liftoff → reply follows the contract. The builder is checked by its hooks' tests and a manual run | Headless runs (`claude -p`) or `claude plugin eval` *(verify its format at milestone 1)*. LLM output varies: run N times, require a pass rate | On demand / before a release (costs tokens) |

Agent and skill behaviour can't be unit-tested like code; the static checks and evals together are the
closest equivalent.

## 12. Liftoff reply contract

Every message to you:

```
<✅ | ⚠️ | ⛔> <one-line status>
Decision: <question, or "none">
Next: <what liftoff does now>
```

Gate questions use `AskUserQuestion`. No narration, no restating the plan.

---

## 13. Verified platform facts

Checked against Claude Code docs (2026-10-12). These shape the design.

| Fact | Consequence |
|------|-------------|
| Subagents can invoke skills on demand via the Skill tool; `skills:` frontmatter **preloads full content** | Agents call skills on demand; avoid `skills:` preload |
| Subagents can spawn subagents, up to 3 levels (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`) | Architect may call explorer itself; cap depth to keep cost bounded |
| **Plugin agents ignore `hooks`, `mcpServers`, `permissionMode` frontmatter** | All enforcement lives in plugin `hooks/hooks.json`, keyed on `agent_type` |
| Hook input carries `agent_id` / `agent_type` inside subagents | Per-role rules from one hooks file |
| SubagentStop can block (`decision: "block"` + reason becomes the agent's next instruction); re-blocks honoured, `stop_hook_active` true after the first (spike 2026-10-16) | Completeness gates force the builder to continue, not just fail |
| VS Code ≤2.1.300 dropped a block that followed the agent's `SubagentHandback` call (agent never resumed); 2.1.301 resumed | `shred.mjs built` re-checks after the builder returns |
| `SendMessage` to a finished subagent resumes it: same `agent_id` / `agent_type`, PreToolUse + SubagentStop fire, one transcript file | Fix rounds go to the same builder, warm |
| A skill's `model` frontmatter does not switch the main session's model | Liftoff runs on the session model |
| SubagentStop provides `agent_transcript_path` | Ledger sums real token usage from the transcript |
| `Agent` tool result `totalTokens` covers the **final request only** | Don't use it for the ledger |
| `isolation: worktree` branches from default branch, auto-cleaned if unchanged | Liftoff manages worktrees itself |

---

## 14. Open questions

None. Agent names are provisional (§7).

---

## 15. Build order

| # | Milestone | Done when |
|---|-----------|-----------|
| 1 | Plugin skeleton, install script, `liftoff` map skill, reply contract, `.liftoff/` state, test harness (script tests + static checks), eval spike | Installs into an empty test repo; liftoff starts and answers in contract format; `node --test` green; one eval runs end to end |
| 2 | Explorer + `profile.md` | Profile generated correctly for a .NET+React repo and a MAUI repo |
| 3 | Intent → specs → plan → shred, architect, `amend-doc`, changelog hook | A sample idea produces approved intent/spec/plan with `R-xx` IDs and changelogs |
| 4 | Twin rotation, worktrees, phase + completeness hooks *(twins superseded by M9)* | One shred built through BUILD/CHALLENGE/REFACTOR in its worktree; hooks block a twin deleting a test |
| 5 | Validators, loop, round cap, escalation *(validators superseded by M9)* | Seeded defect caught, routed, fixed; 4th round denied |
| 6 | Ledger hook, postmortem, `lessons.md` | Ledger shows real tokens/time per run; lessons written |
| 7 | Stack templates for empty repos | Idea → new app walking skeleton on both stacks |
| 8 | Solo baseline benchmark *(removed in M9)* | One agent builds a landed shred from the same spec + base commit in its own worktree; the same validators grade it once. Report: tokens, time, $, blocking findings, tests per `R-xx`, twins vs solo |
| 9 | Lean line: docs step, builder, reviewer | Steps `intent, docs, work, review, final` with 3 human gates; twins, validators and the benchmark removed; build hook re-blocks up to 3; gates cached by tree hash; architect, reviewer and security-reviewer evals pass |

M8 verdict (sandbox + NHL, four runs): twins cost 3-6× and took 4-6× longer than one agent for the same
real defects caught. M9 removed the twins and the benchmark tooling; `costs.mjs` survives behind
`ledger.mjs cost`.

---

## Changelog

| Date | Change | Why |
|------|--------|-----|
| 2026-10-12 | Initial design | Consolidated brainstorm |
| 2026-10-12 | Twin rotation (BUILD → CHALLENGE → REFACTOR) replaces strict ping-pong | Halve spawns; second twin adds value by attacking tests, not only fresh context |
| 2026-10-12 | Models confirmed; explorer haiku, sonnet for profile pass | Profile errors propagate to every hook and agent |
| 2026-10-12 | UX level `none/simple/deep` set by architect | Playwright only where it pays |
| 2026-10-12 | Plugin named `spaceport`; Node.js accepted; hooks match both `agent_type` forms | Resolved open questions |
| 2026-10-12 | Critical + Major block a round; standards-validator checks test relevance | Confirmed; stop low-value tests |
| 2026-10-12 | Testing the factory: script tests, static checks, behavioural evals (§11b); agent names provisional | Factory must meet its own quality bar |
| 2026-10-13 | `agent_type` confirmed namespaced (`spaceport:<name>`); evals granting Bash need WSL2 (no sandbox on native Windows) | Docs check during milestone 1 |
| 2026-10-13 | Milestone 2: profile format, liftoff runs gates, unknown-shape proposals, first hook (read-only guard) | M2 planning |
| 2026-10-14 | Explorer split: `profiler` (sonnet, writes profile) + `explorer` (haiku, read-only Q&A) | A per-spawn model override is persuasive, not enforced |
| 2026-10-14 | `dotnet` stack (backend only); gate failures split into wrong command (fix, retry) vs repo red (no retry, ask user, never weaken) | .NET backends fell to `other`; retries could weaken gates |
| 2026-10-14 | Human gate after shred: approve plan + shred list together | User decision; M3 "done when" requires an approved plan, and shreds were unreviewed |
| 2026-10-14 | Milestone 3: architect questions round-trip; one spawn for plan + shreds; changelog Stop hook with snapshot; app verdict runs as one work order until M7 | M3 planning |
| 2026-10-14 | Human gates enforced: approvals written only from the user's `AskUserQuestion` answer (hook), checked by `state.mjs step` with a doc hash; Decisions table gains a Rejected column | Gates were prompt-only (principle 2) |
| 2026-10-14 | `state.mjs step` moves one step forward (or back to any earlier); amending an approved doc sends liftoff back to its gate (spec change also redoes plan + shred) | Manual test: liftoff jumped to `final`; post-approval spec edit had no recovery path |
| 2026-10-14 | Milestone 4: `shred.mjs` plans turns, opens a sibling worktree (`<repo>.spaceport/`, refused on a red base), commits each turn; `guard-twin` (phases, worktree, test lines) + `guard-turn` (SubagentStop); profile key `test-globs`; `trace-reqs` folded into the turn check | M4 planning; user picked profile globs, red-base refusal, sibling worktrees |
| 2026-10-15 | Milestone 5: validators write own findings files; `validate.mjs` round/verdict/summary; blocking findings → `F` doubts + one fix turn; shreds land on `spaceport/<id>`; `guard-spawn` enforces the round cap; final = summary only; escalation = Stop / Amend spec; UX deep deferred; `close-worktree` dropped (script) | M5 planning; user picked wo branch, summary-only final, escalation options, deferring deep |
| 2026-10-15 | Validator-licensed test removal: `## Remove` in a findings file lets the fix turn delete exactly the quoted test lines | Standards findings asked to remove duplicate tests the twin guard forbids deleting |
| 2026-10-15 | Liftoff denied writes in open shred worktrees | Sandbox: liftoff deleted tests a twin escalated, bypassing the twin guard |
| 2026-10-15 | Milestone 6: ledger hook (one row per agent id, totals); postmortem after final approval; lessons tagged per role, inlined into twin/validator prompts | M6 planning; user picked role-tagged lessons, prompt-only postmortem |
| 2026-10-15 | Milestone 8: solo baseline benchmark (cost + quality, twins vs one agent) | User: prove the factory's cost buys quality |
| 2026-10-15 | Milestone 7: `scaffold.mjs` runs a stack recipe (official generators) into an empty repo, writes the profile, commits; template = green base, skeleton built by twins; `.liftoff/roadmap.md` splits an app into work orders | M7 planning; user picked generators, green base, roadmap file, current empty repo |
| 2026-10-15 | Milestone 8 built: `solo` agent, `bench.mjs` open/round/report, solo completeness in `guard-turn`, bench-aware `guard-spawn`; ledger untouched (time-window attribution) | M8 planning; user picked completeness-only hooks for solo, no skill (one-off), round-1 + all-round comparison, price table |
| 2026-10-16 | Malformed `## Remove` block → findings rejected (validator re-spawned); bench output tokens and $ reconciled with session `cost-state` | NHL run: an unclosed fence licensed nothing and stalled the shred; transcript output_tokens are stream-start snapshots (~4× low) |
| 2026-10-16 | Milestone 9, lean line: one `docs` step + gate (spec + plan, `Test:` line per requirement); one builder replaces the twins, fix rounds via `SendMessage`; one reviewer (strict rubric) + Opus security reviewer only on `sensitive-globs`; max 2 rounds; gate cache; bench, solo, challenger, handoff removed | M8 benchmarks: twins 3-6× the cost, 4-6× the time, no better catch; validators graded noisily from cold contexts. User picked: no twins, 1 reviewer + conditional security, SendMessage fixes, merged docs gate |

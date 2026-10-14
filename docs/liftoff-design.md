# Liftoff — software factory design

Liftoff turns a one-line idea into reviewed, tested, merged-ready code in any repo, through a fixed
line of Claude Code agents. Goal: **consistent quality**, not speed or autonomy.

Status: design, ready to build. Decisions marked *(proposed)* are not confirmed yet.

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
 idea ─▶ 1 INTENT ✋ ─▶ 2 SPECS ✋ ─▶ 3 PLAN ─▶ 4 SHRED ✋ ─▶ 5 WORK ⇄ VALIDATE ─▶ 6 FINAL ✋
                                                         (per shred, ≤3 rounds)
                                                          round 3 fails ─▶ ✋ escalate
```

| # | Step | Who | Output | Human gate |
|---|------|-----|--------|-----------|
| 0 | Explore *(first run on a repo only)* | profiler | `.liftoff/profile.md` | — |
| 1 | Intent | liftoff ⇄ you, explorer on demand | `intent.md` + size verdict | ✋ interactive |
| 2 | Specs | architect | `spec.md` with requirement IDs | ✋ approve |
| 3 | Plan | architect | `plan.md` | — |
| 4 | Shred | architect | shred list in `plan.md` | ✋ approve plan + shreds |
| 5 | Work + validate | twins, then 4 validators | code in a worktree, findings | ✋ only on escalation |
| 6 | Final approval | liftoff → you | PR + summary | ✋ approve |

**Sizing (step 1).** Liftoff decides:
- **Feature** → one work order on the current repo.
- **App** → repo scaffolded from a stack template, then N work orders. The first is always a walking
  skeleton (builds, one screen/endpoint, one passing test).

**Design round-trip (steps 2-4).** Subagents cannot ask the user. The architect's first spawn returns
options, a recommendation and open questions; liftoff asks them with `AskUserQuestion`, then re-spawns it
with the answers to draft (max 2 question rounds per step). One spawn drafts the plan and its shreds; the
shred step only checks coverage (`scripts/docs.mjs`) before the joint gate.

**Validate loop (step 5).** Validators run after the twins declare a shred done. Liftoff routes each
finding back to the twins. Max **3 rounds**; still failing → liftoff halts that shred and escalates with
the open findings.

---

## 3. Roles

Liftoff is the **main session**, not a subagent. Everything else is a subagent shipped by the plugin.

| Agent | Job | Writes | Model |
|-------|-----|--------|-------|
| **liftoff** (main) | Talks to you, routes work, owns state, amends living docs, manages worktrees | `.liftoff/**` | session model |
| **explorer** | Answers "what exists?" about the code | nothing | haiku |
| **profiler** | First run on a repo: writes the profile; stack proposal for unknown shapes | `profile.md`, `proposals/**` | sonnet |
| **architect** | Brainstorms options, drafts specs, plan, shreds | nothing — returns drafts to liftoff | opus |
| **twin** | Senior programmer; one half of the ping-pong pair | code + tests in its worktree | sonnet |
| **spec-validator** | Code conforms to spec: every requirement done, nothing extra | nothing | sonnet |
| **security-validator** | Vulnerabilities, secrets, unsafe patterns in the diff | nothing | opus |
| **standards-validator** | Coding standards, design, naming, per `profile.md` conventions; **test relevance** (§5) | nothing | sonnet |
| **ux-validator** | UX of changed UI, at the level the architect set (§5) | nothing | sonnet |

**Twins** are one agent definition spawned fresh each turn. "A" and "B" are labels in the handoff, not
two definitions.

---

## 4. Twin rotation protocol

One spawn per requirement. The incoming twin first attacks the previous twin's work, then improves
it, then builds the next requirement.

```
 turn 1   Twin A : BUILD R-01
 turn 2   Twin B : CHALLENGE R-01 → REFACTOR R-01 → BUILD R-02
 turn 3   Twin A : CHALLENGE R-02 → REFACTOR R-02 → BUILD R-03
 …
 last     other twin : CHALLENGE + REFACTOR only → shred complete
```

| Phase | Does | May not |
|-------|------|---------|
| **CHALLENGE** | Add edge-case tests (boundaries, nulls, errors, unread requirement clauses); strengthen weak tests ("would this pass if the code were wrong?"); fix what they expose; resolve every doubt in `handoff.md` (fixed / rejected with reason / escalated) | Delete or weaken an existing test; skip a doubt |
| **REFACTOR** | Improve design of the previous requirement's code; tests stay green | Touch any test file |
| **BUILD** | Red → green for the next requirement; list doubts and design choices in `handoff.md` | Write production code before its failing test |

- Every turn is a **fresh context**; `handoff.md` is the only continuity: current phase, requirement
  in play, what's done, design choices, open doubts.
- A twin never challenges or refactors its own work.
- Cost: ~1 spawn per requirement + 1 final.
- Current phase lives in `handoff.md` front matter. Hooks read it (§7).

---

## 5. Validators

- Run **in parallel**, **read-only**, against the shred's worktree diff.
- Output one findings file per round, each finding graded **Critical / Major / Minor**.
- Liftoff decides who fixes each finding (twins; or, if the root cause is the spec/plan, liftoff amends
  the doc and logs it).
- Critical and Major block the round; Minor is logged and shown at final approval.

**Test relevance** (standards-validator). Every test in the diff must earn its place:
- Covers a requirement `R-xx` or a named edge case of one.
- Asserts behaviour, not implementation details (no test that only verifies a mock was called).
- Not a duplicate of another test; not tautological (would fail if the code were wrong).
- Irrelevant tests are a Major finding.

**UX level.** The architect sets it per shred in `plan.md`:

| Level | Validator does |
|-------|----------------|
| `none` | Not spawned (no UI change) |
| `simple` | Reads the UI code only; no Playwright |
| `deep` | Playwright required: launches the app (profile's run command), exercises each UI acceptance criterion, saves a screenshot per criterion |

---

## 6. Work-order folder

```
.liftoff/
  profile.md                  stack, architecture, gate commands, conventions (profiler)
  lessons.md                  fed after every work order (§10)
  wo/<nnn-slug>/
    state.json                step, shred statuses, round counters, worktree paths
    intent.md                 ┐
    spec.md                   ├ living docs — amended only by liftoff, each ends with ## Changelog
    plan.md                   ┘
    shreds/<n>/handoff.md     twin continuity
    shreds/<n>/findings-r<k>.md
    ledger.md                 time + tokens per subagent run (hook-written)
    postmortem.md
    .changelog.json           body hash + row count per living doc (changelog hook)
```

**Living docs.** Liftoff updates them as work reveals new facts. Each change appends a row:

```
## Changelog
| Date | Step | Change | Why |
```

**Requirement IDs.** `spec.md` numbers every requirement `R-01`, `R-02`… Tests reference the ID they
cover (name, attribute or comment, per stack profile).

---

## 7. Hooks (deterministic enforcement)

All hooks are **plugin-level** (`hooks/hooks.json`), written in **Node.js**, and read `profile.md` for
stack-specific commands.

**`agent_type`.** Every hook receives a JSON description of the event. When a subagent acts, it includes
`agent_type`: the agent's name. Absent = liftoff (main session). Plugin components are namespaced
under the plugin name, so the twin is `spaceport:twin`; hooks still match the bare form too.

**Agent names are provisional.** A name is the agent file's `name` field. Hooks read names from one
module (`scripts/roles.mjs`), and the static checks (§11b) flag any dangling reference, so a rename is
one file plus the references the checks list.

| Rule | Event | Applies to | Check |
|------|-------|-----------|-------|
| Standards on every edit | PostToolUse `Edit\|Write` | twin | Run profile's formatter + linter on the changed file; violation → feedback to the twin |
| Read-only checkers | PreToolUse `Edit\|Write\|NotebookEdit` | explorer, profiler (except `profile.md`, `proposals/**`), architect, validators | Deny; fails closed |
| Living docs owned by liftoff | PreToolUse `Edit\|Write` on `intent/spec/plan.md` | any subagent | Deny |
| Changelog required | Stop | liftoff | Living doc body changed since last snapshot without a new changelog row → block |
| Twin phase | PreToolUse `Edit\|Write` | twin | CHALLENGE: test edits may only add (no removed lines). REFACTOR: no test file edits. BUILD: production edit only once a failing test for the requirement exists |
| Stay in the worktree | PreToolUse `Edit\|Write\|Bash` | twin | Path outside assigned worktree → deny |
| Turn complete | SubagentStop | twin | All gates green; every doubt from the incoming `handoff.md` has a resolution; new `handoff.md` written |
| UX deep evidence | SubagentStop | ux-validator at `deep` | One screenshot per UI acceptance criterion exists |
| Shred complete | SubagentStop | twin, when declaring done | Gates green, no `TODO`/`NotImplemented` in diff, every shred `R-xx` referenced by a test |
| Human gates | PostToolUse `AskUserQuestion` | liftoff | Question tagged `[gate <id> <gate>]` answered `Approve…` → approval + doc hash in `state.json`; every answer logged to `gates.log`. `state.mjs step` refuses a step whose earlier gates are unapproved or whose doc changed since |
| Script-owned state | PreToolUse `Edit|Write` | everyone, liftoff included | `state.json`, `gates.log`, `.changelog.json` → deny |
| Round cap | PreToolUse `Agent` | liftoff | Spawning a twin for round 4 → deny |
| Ledger | SubagentStop | all | Sum token usage + elapsed time from `agent_transcript_path` → append to `ledger.md` |

---

## 8. Skills

Small, single-purpose, loaded on demand by agents through the Skill tool.

| Skill | Used by | Does |
|-------|---------|------|
| `liftoff` | main | Entry point: thin step map; loads `steps/<step>.md` on entering a step |
| `explore-repo` | profiler | Writes / refreshes `profile.md` |
| `amend-doc` | liftoff | Edit a living doc + append changelog row |
| `draft-docs` | architect | Brainstorm questions, draft `spec.md` / `plan.md` from templates |
| `write-handoff` | twin | Fill `handoff.md` in the fixed format |
| `run-gates` | twin, liftoff | Run profile's lint, typecheck, test; summarize |
| `trace-reqs` | twin, spec-validator | Map `R-xx` → tests; list gaps |
| `log-finding` | validators | Append a graded finding in the fixed format |
| `open-worktree` / `close-worktree` | liftoff | Create / merge / remove a shred's worktree |
| `report-back` | every subagent | Fixed, short return format to liftoff |
| `postmortem` | liftoff | Write `postmortem.md`, feed `lessons.md` |

---

## 9. Progressive disclosure

- `liftoff/SKILL.md` is a **map**: steps, gates, where each step's instructions live. Each
  `steps/*.md` loads only when that step starts.
- Agent definitions are **short**: role, boundaries, which skills to call. They do not inline skill
  content (no `skills:` preload, except possibly `report-back`).
- `profile.md` and `lessons.md` are read only by the agents and steps that need them.
- Subagents return a `report-back` summary; full output stays on disk. Liftoff's context grows by
  summaries only.

---

## 10. Memory

After each work order, liftoff runs `postmortem`:
- What failed, which round caught it, which agent caused it, time/tokens from the ledger.
- Durable lessons appended to `.liftoff/lessons.md` (repo-specific).
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
  agents/        explorer.md, profiler.md, architect.md, twin.md, *-validator.md
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
(`stack`, `gate-format|lint|typecheck|build|test`, `run`, `req-tag`, `ui-globs`; `none` = n/a) + architecture, folder
roles, conventions. The profiler infers without running anything; liftoff runs the gates (`run-gates`) and
re-spawns the profiler on failure (max 2). Known stacks are cue files (`skills/explore-repo/stacks/`), each
with a fixture + eval; an unknown repo gets `stack: other` and a proposal in `.liftoff/proposals/<shape>/`.

**Stacks** (for empty repos only): `.NET + React/TypeScript/Vite`, `MAUI`. Each template ships a
starter repo and a pre-filled `profile.md`.

**Worktrees.** Used whenever possible: one per shred, created and removed by liftoff
(`git worktree`). The built-in agent `isolation: worktree` is not used for twins — it creates a new
worktree per spawn and branches from the default branch, but twins must share one worktree across turns.
Independent shreds may run in parallel; dependent ones merge in order.

---

## 11b. Testing the factory itself

Three layers, from cheap and deterministic to costly and statistical.

| Layer | Tests | How | When |
|-------|-------|-----|------|
| **Scripts** | Every hook and the install script | `node:test` (built in, no deps). Feed a fixture hook-input JSON on stdin, assert exit code / decision JSON. Fixture repos for profile-dependent hooks | Every commit |
| **Static checks** on agents + skills | Frontmatter valid (`name`, `description`, `tools`, `model`); every file a skill or step references exists; every skill an agent names exists; every agent name used by hooks exists; no `skills:` preload; size budget per `SKILL.md` / agent file (enforces progressive disclosure) | `node:test` over the plugin folder | Every commit |
| **Behavioural evals** for agents + skills | Scenario per agent against a fixture repo, asserting on artifacts: profiler → correct gate commands in `profile.md`; twin → hooks pass, requirement covered; each validator → catches a seeded defect at the right severity; liftoff → reply follows the contract | Headless runs (`claude -p`) or `claude plugin eval` *(verify its format at milestone 1)*. LLM output varies: run N times, require a pass rate | On demand / before a release (costs tokens) |

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
| SubagentStop can block (`decision: "block"` + reason becomes the agent's next instruction) | Completeness gates force twins to continue, not just fail |
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
| 4 | Twin rotation, worktrees, phase + completeness hooks | One shred built through BUILD/CHALLENGE/REFACTOR in its worktree; hooks block a twin deleting a test |
| 5 | Validators, loop, round cap, escalation | Seeded defect caught, routed, fixed; 4th round denied |
| 6 | Ledger hook, postmortem, `lessons.md` | Ledger shows real tokens/time per run; lessons written |
| 7 | Stack templates for empty repos | Idea → new app walking skeleton on both stacks |

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

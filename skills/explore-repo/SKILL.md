---
name: explore-repo
description: Write or repair a repo's .liftoff/profile.md for the spaceport factory - stack, gate commands (format, lint, typecheck, build, test), run command, R-xx test tagging, UI globs, architecture and conventions. Proposes a new stack when the repo matches none. Use for the profiler agent's pass.
---

# Explore repo

Inputs from the prompt: **repo root**, **profile path**, and on a retry the **failures** to fix.

## 1. Survey

Read, from the repo root:
- Top two folder levels (Glob).
- Build manifests: `*.sln`, `*.slnx`, `*.csproj`, `Directory.Build.props`, `global.json`,
  `package.json`, lock files, `go.mod`, `pyproject.toml`, `Cargo.toml`.
- Tool config: `.editorconfig`, eslint, prettier, `tsconfig*.json`, test configs.
- CI (`.github/workflows/*`, `.teamcity`, `azure-pipelines.yml`) and `README*`: the commands
  the team already runs.

## 2. Match a stack

| Stack | Cue | File |
|-------|-----|------|
| `dotnet-react-vite` | .NET solution + a Vite React TypeScript app | [stacks/dotnet-react-vite.md](stacks/dotnet-react-vite.md) |
| `maui` | csproj with `<UseMaui>true</UseMaui>` | [stacks/maui.md](stacks/maui.md) |
| `dotnet` | .NET solution/projects only: APIs, workers, libraries | [stacks/dotnet.md](stacks/dotnet.md) |

Rows go most specific first: take the first row whose cue fits, read only its file and check its
**Match** rules. No match → `stack: other`, then step 4.

## 3. Write the profile

Copy [profile-template.md](profile-template.md) to the profile path and fill every key.

- Commands the repo declares (scripts, CI, README) win over stack defaults.
- Every command runs from the repo root, in bash, chained with `&&`.
- `gate-format` and `gate-lint` **check**, never rewrite (`--check`, `--verify-no-changes`).
- `none` only when the repo truly has no such tool. `stack`, `gate-build`, `gate-test` and
  `req-tag` are never `none`.
- Never name a tool the repo doesn't have. If unsure, prefer the plainest command.
- Fill **Gate sources**: where each command came from (file, or "stack default").

## 4. Unknown shape

Still write the full profile, inferring as above. Then follow [proposal.md](proposal.md).

## 5. Retry

Given failures, judge each failing gate from its evidence:

- **Wrong command** (tool or path missing, unknown option, watch mode, wrong project): fix that
  key and add a **Gate sources** note on what changed.
- **Repo red** (the command is right but the code fails it: compile errors, failing tests,
  format drift): keep the command and list the gate under `Red:` in your report.

Never weaken a command to make it pass (no dropped projects, no skipped tests, no removed
`--verify-no-changes`). Don't touch passing gates.

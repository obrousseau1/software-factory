# EXPERIMENTAL - software-factory

### (Probably over-engineered and overkill for many applications. Mostly done for learning purposes)

`spaceport`: a Claude Code plugin that runs an agent software factory. Its orchestrator, **liftoff**,
turns a one-line idea into reviewed, tested code. Design: [docs/liftoff-design.md](docs/liftoff-design.md).

Status: milestone 6 — a ledger logs real tokens and time per subagent run; after final approval a postmortem feeds role-tagged lessons back into later prompts. Stack templates are next.

## Install into a repo

Requires Node.js 24+.

```
node install/install.mjs <repo>           # marketplace from GitHub
node install/install.mjs <repo> --local   # marketplace from this checkout (development)
```

The script runs `claude plugin marketplace add` and `claude plugin install` at project scope, using
`claude` on PATH or the binary bundled with the VS Code extension. Then start a new Claude Code session
in `<repo>` and run `/spaceport:liftoff <idea>`.

## Test

```
npm test                                                      # scripts + static checks
claude plugin validate --strict .                             # manifests
claude plugin eval . --ablation none --trust-plugin --allow-tools Write   # behaviour (costs model usage)
```

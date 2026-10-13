# software-factory

`spaceport`: a Claude Code plugin that runs an agent software factory. Its orchestrator, **liftoff**,
turns a one-line idea into reviewed, tested code. Design: [docs/liftoff-design.md](docs/liftoff-design.md).

Status: milestone 1 — plugin skeleton, install, liftoff step map. Steps are stubs.

## Install into a repo

Requires Node.js 24+.

```
node install/install.mjs <repo>           # marketplace from GitHub
node install/install.mjs <repo> --local   # marketplace from this checkout (development)
```

Then open Claude Code in `<repo>`, accept the plugin prompt, and run `/spaceport:liftoff <idea>`.

## Test

```
node --test                                                   # scripts + static checks
claude plugin validate --strict .                             # manifests
claude plugin eval . --ablation none --trust-plugin           # behaviour (costs model usage)
```

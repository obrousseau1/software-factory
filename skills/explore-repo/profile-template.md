---
stack: <stack name | other>
setup: <command installing dependencies into a fresh clone (lockfile-exact) | none>
gate-format: <check-only format command | none>
gate-lint: <lint command | none>
gate-typecheck: <typecheck command | none>
gate-build: <build command>
gate-test: <test command, excluding manual/integration tests that need live services>
run: <command that starts the app | none>
test-globs: <comma-separated globs of test files and folders; hooks protect these>
ui-globs: <comma-separated globs of UI source files | none>
sensitive-globs: <comma-separated globs of auth, trust-boundary input, secrets, external I/O, dependency manifests | none; drop the line when unsure: security then reviews every shred>
---

# Repo profile

## Architecture

<3-6 lines: the apps/projects and how they connect.>

## Folder roles

| Folder | Role |
|--------|------|

## Conventions

- <Naming, test layout, style rules found in config or code.>

## Gate sources

| Key | From |
|-----|------|

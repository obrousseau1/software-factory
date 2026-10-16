---
stack: maui
setup: none
gate-format: dotnet format {{Name}}.slnx --verify-no-changes
gate-lint: none
gate-typecheck: none
gate-build: dotnet build {{Name}}.slnx
gate-test: dotnet test tests/{{Name}}.Core.Tests
run: dotnet build src/{{Name}} -t:Run
req-tag: xUnit [Trait("Req", "R-01")]
test-globs: tests/**
ui-globs: **/*.xaml, **/*.xaml.cs
sensitive-globs: **/MauiProgram.cs, **/*Auth*, **/*Auth*/**, **/*Http*.cs, **/*Storage*.cs, **/*.csproj
---

# Repo profile

## Architecture

MAUI app `{{Name}}` (Windows only) over a plain .NET library `{{Name}}.Core` holding the logic.
xUnit tests cover `{{Name}}.Core`. Scaffolded by spaceport from the `maui` template.

## Folder roles

| Folder | Role |
|--------|------|
| `src/{{Name}}` | MAUI UI (XAML pages) |
| `src/{{Name}}.Core` | Domain logic, no MAUI dependency |
| `tests/{{Name}}.Core.Tests` | xUnit tests for `{{Name}}.Core` |

## Conventions

- UI logic stays thin; logic lives in `{{Name}}.Core` so it is testable.
- Other platforms: add their target framework to `src/{{Name}}/{{Name}}.csproj` and its workload.

## Gate sources

| Key | From |
|-----|------|
| all | spaceport template `maui` |

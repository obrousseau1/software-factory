---
stack: maui
setup: none
gate-format: dotnet format Notes.App/Notes.App.csproj --verify-no-changes && dotnet format Notes.Core.Tests/Notes.Core.Tests.csproj --verify-no-changes
gate-lint: none
gate-typecheck: none
gate-build: dotnet build Notes.App/Notes.App.csproj -f net10.0-windows10.0.19041.0
gate-test: dotnet test Notes.Core.Tests/Notes.Core.Tests.csproj
run: dotnet build Notes.App/Notes.App.csproj -t:Run -f net10.0-windows10.0.19041.0
test-globs: Notes.Core.Tests/**
ui-globs: **/*.xaml, **/*.xaml.cs
sensitive-globs: **/MauiProgram.cs, **/*Auth*, **/*Auth*/**, **/*Http*.cs, **/*Storage*.cs, **/*.csproj
---

# Repo profile

## Architecture

MAUI app `Notes.App` (Android, Windows) over a plain .NET library `Notes.Core` holding the logic.
xUnit tests cover `Notes.Core` only. No solution file.

## Folder roles

| Folder | Role |
|--------|------|
| `Notes.App` | MAUI UI (XAML pages) |
| `Notes.Core` | Domain logic, no MAUI dependency |
| `Notes.Core.Tests` | xUnit v3 tests for `Notes.Core` |

## Conventions

- UI logic stays thin; logic lives in `Notes.Core` so it is testable.

## Gate sources

| Key | From |
|-----|------|
| all | stack default (no CI or scripts in the repo) |

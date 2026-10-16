---
stack: dotnet-react-vite
setup: npm --prefix web ci
gate-format: dotnet format {{Name}}.slnx --verify-no-changes
gate-lint: npm --prefix web run lint
gate-typecheck: npm --prefix web run typecheck
gate-build: dotnet build {{Name}}.slnx && npm --prefix web run build
gate-test: dotnet test {{Name}}.slnx && npm --prefix web test
run: dotnet run --project src/{{Name}}.Api
req-tag: xUnit [Trait("Req", "R-01")]; Vitest: test name starts with R-01:
test-globs: tests/**, web/src/**/*.test.ts, web/src/**/*.test.tsx
ui-globs: web/src/**/*.tsx, web/src/**/*.css
sensitive-globs: **/Program.cs, **/*Controller.cs, **/*Endpoints.cs, **/*Auth*, **/*Auth*/**, **/appsettings*.json, **/*.csproj, web/src/**/api/**, web/src/**/*Auth*, web/package.json
---

# Repo profile

## Architecture

ASP.NET Core API `{{Name}}.Api` and a Vite React TypeScript app in `web/`. xUnit tests cover the
API; Vitest covers the web app. Scaffolded by spaceport from the `dotnet-react-vite` template.

## Folder roles

| Folder | Role |
|--------|------|
| `src/{{Name}}.Api` | HTTP API |
| `tests/{{Name}}.Api.Tests` | xUnit tests for the API |
| `web` | React UI (Vite, npm) |

## Conventions

- Web tests sit next to their source as `*.test.ts(x)`.

## Gate sources

| Key | From |
|-----|------|
| all | spaceport template `dotnet-react-vite` |

---
stack: dotnet-react-vite
gate-format: dotnet format Shop.sln --verify-no-changes && pnpm --dir web format
gate-lint: pnpm --dir web lint
gate-typecheck: pnpm --dir web typecheck
gate-build: dotnet build Shop.sln && pnpm --dir web build
gate-test: dotnet test Shop.sln && pnpm --dir web test
run: dotnet run --project src/Shop.Api/Shop.Api.csproj
req-tag: xUnit [Trait("Req", "R-01")]; Vitest test name starts with "R-01:"
ui-globs: web/src/**/*.tsx, web/src/**/*.css
---

# Repo profile

## Architecture

ASP.NET Core minimal API (`src/Shop.Api`) serving `/api/products`. React + Vite SPA in `web/`,
proxying `/api` to the API in development. xUnit integration tests in `tests/Shop.Api.Tests`.

## Folder roles

| Folder | Role |
|--------|------|
| `src/Shop.Api` | HTTP API |
| `tests/Shop.Api.Tests` | API tests (xUnit v3, WebApplicationFactory) |
| `web/` | React SPA (Vite, Vitest, ESLint, Prettier) |

## Conventions

- Tests sit next to components in `web/src` (`*.test.tsx`).

## Gate sources

| Key | From |
|-----|------|
| gate-format | stack default + `web/package.json` `format` |
| gate-lint, gate-typecheck | `web/package.json` scripts |
| gate-build, gate-test | stack default + `web/package.json` scripts |

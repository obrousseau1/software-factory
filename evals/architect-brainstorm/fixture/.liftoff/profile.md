---
stack: dotnet
gate-format: dotnet format Orders.sln --verify-no-changes
gate-lint: none
gate-typecheck: none
gate-build: dotnet build Orders.sln
gate-test: dotnet test Orders.sln --filter "Category!=Integration"
run: dotnet run --project src/Orders.Api/Orders.Api.csproj
req-tag: NUnit [Property("Req", "R-01")]
ui-globs: none
---

# Repo profile

## Architecture

ASP.NET Core minimal API `Orders.Api` over a domain library `Orders.Domain`. NUnit tests cover the
domain; integration tests are tagged `Category("Integration")` and excluded in CI.

## Folder roles

| Folder | Role |
|--------|------|
| `src/Orders.Api` | HTTP host |
| `src/Orders.Domain` | Domain records and rules |
| `tests/Orders.Domain.Tests` | NUnit tests |

## Conventions

- `Directory.Build.props`: net10.0, nullable, warnings as errors.

## Gate sources

| Key | From |
|-----|------|
| gate-build, gate-test | `.github/workflows/ci.yml` |
| others | stack default |

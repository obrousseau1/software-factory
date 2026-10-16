# dotnet

## Match

- A `.sln`/`.slnx` or `.csproj` files only: ASP.NET Core APIs, workers, console apps, libraries.
- Still a match: Razor Pages/MVC/Blazor Server views inside the .NET projects, several solutions
  (pick the one CI builds), F# projects.
- Not a match: a React/Vite app (`dotnet-react-vite`), `UseMaui` (`maui`), another SPA framework
  (`other`).

## Defaults

`<sln>` = the solution CI builds, else the root one; no solution → the projects one by one.

| Key | Default |
|-----|---------|
| setup | `none` *(`dotnet build` restores)* |
| gate-format | `dotnet format <sln> --verify-no-changes` |
| gate-lint | `none` *(analyzers run in the build)* |
| gate-typecheck | `none` *(the build compiles)* |
| gate-build | `dotnet build <sln>` |
| gate-test | `dotnet test <sln>` + the CI `--filter`, if any |
| run | `dotnet run --project <host csproj>` *(the `Microsoft.NET.Sdk.Web` or `Worker` project)* |

## req-tag

xUnit: `[Trait("Req", "R-01")]`. NUnit: `[Property("Req", "R-01")]`. MSTest:
`[TestProperty("Req", "R-01")]`.

## test-globs

The test projects' folders, e.g. `tests/**` or `<Name>.Tests/**`.

## ui-globs

`none`, unless Razor/Blazor views exist: `**/*.cshtml`, `**/*.razor`.

## sensitive-globs

Where the security reviewer looks: trust boundaries, auth, secrets, dependencies.
`**/Program.cs`, `**/*Controller.cs`, `**/*Endpoints.cs`, `**/*Auth*`, `**/*Auth*/**`, `**/appsettings*.json`, `**/*.csproj`; add the repo's own auth or parsing folders.

## Watch

- CI test filters (`--filter "Category!=Integration"`) exclude tests that need live services:
  copy them into `gate-test`.
- `TreatWarningsAsErrors` in `Directory.Build.props` makes the build the lint gate.

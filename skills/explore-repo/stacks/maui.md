# maui

## Match

- A `.csproj` with `<UseMaui>true</UseMaui>`.
- Still a match: extra class libraries, a test project, a solution file or none.
- Not a match: Xamarin.Forms (no `UseMaui`), Blazor Hybrid without MAUI, WPF/WinUI only.

## Defaults

`<app>` = the MAUI csproj; `<tfm>` = its Windows target framework (e.g.
`net10.0-windows10.0.19041.0`); `<tests>` = the test project, or the solution.

| Key | Default |
|-----|---------|
| setup | `none` *(`dotnet build` restores)* |
| gate-format | `dotnet format <sln or app> --verify-no-changes` |
| gate-lint | `none` *(analyzers run in the build)* |
| gate-typecheck | `none` *(the build compiles)* |
| gate-build | `dotnet build <app> -f <tfm>` |
| gate-test | `dotnet test <tests>` |
| run | `dotnet build <app> -t:Run -f <tfm>` |

## test-globs

The test projects' folders, e.g. `<Name>.Tests/**`.

## ui-globs

`**/*.xaml`, `**/*.xaml.cs`.

## sensitive-globs

Where the security reviewer looks: auth, secure storage, HTTP clients, dependencies.
`**/MauiProgram.cs`, `**/*Auth*`, `**/*Auth*/**`, `**/*Http*.cs`, `**/*Storage*.cs`, `**/*.csproj`; add the repo's own auth or storage folders.

## Watch

- Building all target frameworks needs the Android/iOS workloads: build one framework.
- Test projects usually reference a plain `netX.0` library, not the MAUI app.

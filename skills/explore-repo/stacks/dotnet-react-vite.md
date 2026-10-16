# dotnet-react-vite

## Match

- A `.sln`/`.slnx` or `.csproj` (ASP.NET Core or class libraries), **and** a `package.json` with
  `vite` and `react`, usually in a sub-folder (`web/`, `client/`, `src/*.Web/ClientApp`).
- Still a match: several .NET projects, the React app inside a .NET project folder, npm/yarn
  instead of pnpm.
- Not a match: .NET only (no React app → `dotnet`), React without .NET, Next.js or Angular.

## Defaults

Use only where the repo declares nothing better. `<sln>` = the solution; `<web>` = the React folder.
Package manager from the lock file (`pnpm-lock.yaml` → `pnpm --dir <web>`, `package-lock.json` →
`npm --prefix <web> run`, `yarn.lock` → `yarn --cwd <web>`).

| Key | Default |
|-----|---------|
| setup | `<pm> install` with its lockfile flag: `pnpm --dir <web> install --frozen-lockfile`, `npm ci`, `yarn install --immutable` |
| gate-format | `dotnet format <sln> --verify-no-changes && <pm> format` *(only if a `format` script checks)* |
| gate-lint | `<pm> lint` |
| gate-typecheck | `<pm> typecheck` (or `tsc -b` via the package manager) |
| gate-build | `dotnet build <sln> && <pm> build` |
| gate-test | `dotnet test <sln> && <pm> test` (non-watch, e.g. `vitest run`) |
| run | `dotnet run --project <api csproj>` *(the web dev server is started separately)* |

## test-globs

The .NET test projects' folders plus the web test files, e.g. `tests/**, <web>/src/**/*.test.ts, <web>/src/**/*.test.tsx`.

## ui-globs

`<web>/src/**/*.tsx`, `<web>/src/**/*.css`.

## sensitive-globs

Where the security reviewer looks: trust boundaries, auth, secrets, dependencies. The .NET side:
`**/Program.cs`, `**/*Controller.cs`, `**/*Endpoints.cs`, `**/*Auth*`, `**/*Auth*/**`, `**/appsettings*.json`, `**/*.csproj`; the web side: `<web>/src/**/api/**`, `<web>/src/**/*Auth*`,
`<web>/package.json`. Add the repo's own auth or parsing folders.

## Watch

- A `test` script without `run` starts Vitest in watch mode: use `vitest run`.
- Test categories CI excludes (manual, integration) must be excluded in `gate-test` too.

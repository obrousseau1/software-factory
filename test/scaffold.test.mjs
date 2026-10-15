import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isEmpty, scaffold } from '../scripts/scaffold.mjs';
import { profilePath, readProfile, validateProfile } from '../scripts/profile.mjs';

const CSPROJ = `<TargetFrameworks>net10.0-android</TargetFrameworks>
<TargetFrameworks Condition="windows">$(TargetFrameworks);net10.0-windows10.0.19041.0</TargetFrameworks>`;

function emptyRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'spaceport-scaffold-'));
  for (const dir of ['.git', '.claude', '.liftoff/wo/001-x']) mkdirSync(join(repo, dir), { recursive: true });
  return repo;
}

// Records commands; `dotnet new maui` writes a generated-looking csproj for the replace step.
function recorder(csproj = CSPROJ) {
  const commands = [];
  const run = (command, repo) => {
    commands.push(command);
    if (command.startsWith('dotnet new maui')) {
      mkdirSync(join(repo, 'src', 'Demo'), { recursive: true });
      writeFileSync(join(repo, 'src', 'Demo', 'Demo.csproj'), csproj);
    }
  };
  return { commands, run };
}

test('empty: only .git, .claude, .liftoff', () => {
  const repo = emptyRepo();
  assert.equal(isEmpty(repo), true);
  writeFileSync(join(repo, 'README.md'), '');
  assert.equal(isEmpty(repo), false);
});

test('refuses unknown stack, bad name, no git, non-empty repo', () => {
  const { run } = recorder();
  assert.throws(() => scaffold(emptyRepo(), 'cobol', 'Demo', run), /Unknown stack/);
  assert.throws(() => scaffold(emptyRepo(), 'maui', 'demo app', run), /Name must match/);
  const noGit = mkdtempSync(join(tmpdir(), 'spaceport-scaffold-'));
  assert.throws(() => scaffold(noGit, 'maui', 'Demo', run), /Not a git repository/);
  const full = emptyRepo();
  writeFileSync(join(full, 'Program.cs'), '');
  assert.throws(() => scaffold(full, 'maui', 'Demo', run), /not empty/);
});

test('runs the recipe with the name filled in, then commits without work orders', () => {
  const { commands, run } = recorder();
  scaffold(emptyRepo(), 'dotnet-react-vite', 'Demo', run);
  assert.equal(commands[0], 'dotnet new sln -n Demo');
  assert.ok(commands.includes('dotnet new webapi -n Demo.Api -o src/Demo.Api'));
  assert.ok(commands.every((command) => !command.includes('{{')));
  assert.ok(commands.some((command) => command.includes('--template react-ts')), 'web app is TypeScript');
  assert.deepEqual(commands.slice(-2), [
    'git add -A -- . ":(exclude).liftoff/wo"',
    'git commit -q -m "spaceport: scaffold dotnet-react-vite"',
  ]);
});

test('writes a valid profile with the name filled in', () => {
  const repo = emptyRepo();
  scaffold(repo, 'maui', 'Demo', recorder().run);
  const meta = readProfile(profilePath(repo));
  assert.deepEqual(validateProfile(meta), []);
  assert.equal(meta['gate-build'], 'dotnet build Demo.slnx');
  assert.ok(!readFileSync(profilePath(repo), 'utf8').includes('{{'));
});

test('maui: csproj keeps only the Windows target framework', () => {
  const repo = emptyRepo();
  scaffold(repo, 'maui', 'Demo', recorder().run);
  const csproj = readFileSync(join(repo, 'src', 'Demo', 'Demo.csproj'), 'utf8');
  assert.equal(csproj, '<TargetFrameworks>net10.0-windows10.0.19041.0</TargetFrameworks>');
});

test('a replace step that matches nothing fails with a cleanup hint', () => {
  assert.throws(
    () => scaffold(emptyRepo(), 'maui', 'Demo', recorder('<TargetFramework>net10.0</TargetFramework>').run),
    /pattern not found[\s\S]*git clean/,
  );
});

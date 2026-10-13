import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GITHUB_REPO, PLUGIN_ID, Source, findClaude, install } from '../install/install.mjs';

const script = fileURLToPath(new URL('../install/install.mjs', import.meta.url));
const tempDir = () => mkdtempSync(join(tmpdir(), 'spaceport-install-'));

function recorder() {
  const calls = [];
  return { calls, run: (claude, args, cwd) => calls.push({ claude, args, cwd }) };
}

test('github install adds marketplace then installs plugin, both at project scope', () => {
  const repo = tempDir();
  const { calls, run } = recorder();
  install(repo, Source.Github, run, 'claude');
  assert.deepEqual(calls.map((c) => c.args), [
    ['plugin', 'marketplace', 'add', GITHUB_REPO, '--scope', 'project'],
    ['plugin', 'install', PLUGIN_ID, '--scope', 'project'],
  ]);
  assert.ok(calls.every((c) => c.cwd === repo));
});

test('local install points the marketplace at this checkout', () => {
  const { calls, run } = recorder();
  install(tempDir(), Source.Local, run, 'claude');
  const source = calls[0].args[3];
  assert.ok(existsSync(join(source, '.claude-plugin', 'marketplace.json')));
});

test('creates the work-order folder', () => {
  const repo = tempDir();
  install(repo, Source.Github, recorder().run, 'claude');
  assert.ok(existsSync(join(repo, '.liftoff', 'wo')));
});

test('reports whether the repo has git', () => {
  const repo = tempDir();
  assert.equal(install(repo, Source.Github, recorder().run, 'claude').hasGit, false);
  mkdirSync(join(repo, '.git'));
  assert.equal(install(repo, Source.Github, recorder().run, 'claude').hasGit, true);
});

test('missing repo fails before calling the CLI', () => {
  const { calls, run } = recorder();
  assert.throws(() => install(join(tempDir(), 'nope'), Source.Github, run, 'claude'), /Not a directory/);
  assert.equal(calls.length, 0);
});

test('a failing CLI call stops the install', () => {
  const repo = tempDir();
  const failing = () => { throw new Error('marketplace add failed'); };
  assert.throws(() => install(repo, Source.Github, failing, 'claude'), /marketplace add failed/);
  assert.equal(existsSync(join(repo, '.liftoff')), false);
});

test('findClaude falls back to the newest VS Code extension binary', (t) => {
  if (spawnSync('claude', ['--version']).status === 0) return t.skip('claude is on PATH');
  const home = tempDir();
  const binary = process.platform === 'win32' ? 'claude.exe' : 'claude';
  for (const version of ['2.1.9', '2.1.10']) {
    const dir = join(home, '.vscode', 'extensions', `anthropic.claude-code-${version}`, 'resources', 'native-binary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, binary), '');
  }
  assert.match(findClaude(home), /claude-code-2\.1\.10/);
});

test('findClaude fails clearly when nothing is found', (t) => {
  if (spawnSync('claude', ['--version']).status === 0) return t.skip('claude is on PATH');
  assert.throws(() => findClaude(tempDir()), /CLI not found/);
});

test('cli without a repo prints usage and exits 1', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage/);
});

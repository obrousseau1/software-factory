import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GITHUB_REPO, MARKETPLACE, PLUGIN_ID, Source, install } from '../install/install.mjs';

const script = fileURLToPath(new URL('../install/install.mjs', import.meta.url));
const tempRepo = () => mkdtempSync(join(tmpdir(), 'spaceport-install-'));
const settingsOf = (repo) => join(repo, '.claude', 'settings.json');
const readSettings = (repo) => JSON.parse(readFileSync(settingsOf(repo), 'utf8'));

test('creates settings with github marketplace and enabled plugin', () => {
  const repo = tempRepo();
  install(repo);
  const settings = readSettings(repo);
  assert.deepEqual(settings.extraKnownMarketplaces[MARKETPLACE], {
    source: { source: 'github', repo: GITHUB_REPO },
  });
  assert.equal(settings.enabledPlugins[PLUGIN_ID], true);
});

test('local source points at this checkout', () => {
  const repo = tempRepo();
  install(repo, Source.Local);
  const { source } = readSettings(repo).extraKnownMarketplaces[MARKETPLACE];
  assert.equal(source.source, 'directory');
  assert.ok(existsSync(join(source.path, '.claude-plugin', 'marketplace.json')));
});

test('merges with existing settings', () => {
  const repo = tempRepo();
  mkdirSync(join(repo, '.claude'));
  writeFileSync(settingsOf(repo), JSON.stringify({
    model: 'sonnet',
    enabledPlugins: { 'other@market': true },
    extraKnownMarketplaces: { market: { source: { source: 'github', repo: 'x/y' } } },
  }));
  install(repo);
  const settings = readSettings(repo);
  assert.equal(settings.model, 'sonnet');
  assert.equal(settings.enabledPlugins['other@market'], true);
  assert.ok(settings.extraKnownMarketplaces.market);
  assert.equal(settings.enabledPlugins[PLUGIN_ID], true);
});

test('is idempotent', () => {
  const repo = tempRepo();
  install(repo);
  const first = readFileSync(settingsOf(repo), 'utf8');
  install(repo);
  assert.equal(readFileSync(settingsOf(repo), 'utf8'), first);
});

test('creates the work-order folder', () => {
  const repo = tempRepo();
  install(repo);
  assert.ok(existsSync(join(repo, '.liftoff', 'wo')));
});

test('reports whether the repo has git', () => {
  const repo = tempRepo();
  assert.equal(install(repo).hasGit, false);
  mkdirSync(join(repo, '.git'));
  assert.equal(install(repo).hasGit, true);
});

test('invalid existing settings are left untouched', () => {
  const repo = tempRepo();
  mkdirSync(join(repo, '.claude'));
  writeFileSync(settingsOf(repo), '{ broken');
  assert.throws(() => install(repo), /Not valid JSON/);
  assert.equal(readFileSync(settingsOf(repo), 'utf8'), '{ broken');
});

test('missing repo fails', () => {
  assert.throws(() => install(join(tempRepo(), 'nope')), /Not a directory/);
});

test('cli without a repo prints usage and exits 1', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage/);
});

test('cli --local installs and warns', () => {
  const repo = tempRepo();
  const result = spawnSync(process.execPath, [script, repo, '--local'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /do not commit/);
  assert.equal(readSettings(repo).extraKnownMarketplaces[MARKETPLACE].source.source, 'directory');
});

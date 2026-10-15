import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gateCommands, isTest, readProfile, validateProfile } from '../scripts/profile.mjs';

const script = fileURLToPath(new URL('../scripts/profile.mjs', import.meta.url));
const expected = fileURLToPath(new URL('./expected-profiles', import.meta.url));

const valid = {
  stack: 'maui',
  setup: 'none',
  'gate-format': 'dotnet format --verify-no-changes',
  'gate-lint': 'none',
  'gate-typecheck': 'none',
  'gate-build': 'dotnet build App.csproj',
  'gate-test': 'dotnet test',
  run: 'none',
  'req-tag': '[Trait("Req", "R-01")]',
  'test-globs': 'tests/**, **/*Tests.cs',
  'ui-globs': '**/*.xaml',
};

const writeProfile = (meta) => {
  const file = join(mkdtempSync(join(tmpdir(), 'spaceport-profile-')), 'profile.md');
  const lines = Object.entries(meta).map(([key, value]) => `${key}: ${value}`);
  writeFileSync(file, ['---', ...lines, '---', '', '# Repo profile', ''].join('\n'));
  return file;
};

test('valid profile has no errors', () => {
  assert.deepEqual(validateProfile(valid), []);
});

test('missing key is reported', () => {
  const { run, ...meta } = valid;
  assert.deepEqual(validateProfile(meta), ['missing run']);
});

test('required key cannot be none', () => {
  assert.deepEqual(validateProfile({ ...valid, 'gate-test': 'none' }), ['gate-test cannot be none']);
});

test('test-globs cannot be none', () => {
  assert.deepEqual(validateProfile({ ...valid, 'test-globs': 'none' }), ['test-globs cannot be none']);
});

test('isTest matches any of the comma-separated globs', () => {
  assert.ok(isTest(valid, 'tests/A/B.cs'));
  assert.ok(isTest(valid, 'src/App/AppTests.cs'));
  assert.ok(!isTest(valid, 'src/App/App.cs'));
});

test('gates skip none, keep order', () => {
  assert.deepEqual(gateCommands(valid), {
    format: 'dotnet format --verify-no-changes',
    build: 'dotnet build App.csproj',
    test: 'dotnet test',
  });
});

test('readProfile parses frontmatter, keeps quotes inside values', () => {
  assert.equal(readProfile(writeProfile(valid))['req-tag'], '[Trait("Req", "R-01")]');
});

test('readProfile throws on a missing file', () => {
  assert.throws(() => readProfile(join(tmpdir(), 'nope', 'profile.md')), /No profile/);
});

test('cli check exits 1 on an invalid profile', () => {
  const result = spawnSync('node', [script, 'check', writeProfile({ ...valid, stack: 'none' })], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).errors, ['stack cannot be none']);
});

test('cli gates prints commands', () => {
  const result = spawnSync('node', [script, 'gates', writeProfile(valid)], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).build, 'dotnet build App.csproj');
});

for (const file of readdirSync(expected)) {
  test(`expected profile ${file} is valid`, () => {
    assert.deepEqual(validateProfile(readProfile(join(expected, file))), []);
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SNAPSHOT, decide } from '../scripts/guard-changelog.mjs';

const script = fileURLToPath(new URL('../scripts/guard-changelog.mjs', import.meta.url));
const row = (n) => `| 2026-10-1${n} | specs | Change ${n} | Why ${n} |`;
const doc = (text, rows) => `# Spec\n\n${text}\n\n## Changelog\n| Date | Step | Change | Why |\n|---|---|---|---|\n${rows.join('\n')}\n`;

function repo() {
  const cwd = mkdtempSync(join(tmpdir(), 'spaceport-changelog-'));
  const wo = join(cwd, '.liftoff', 'wo', '001-x');
  mkdirSync(wo, { recursive: true });
  return { cwd, wo, write: (text) => writeFileSync(join(wo, 'spec.md'), text) };
}

test('no work orders → allowed', () => {
  assert.equal(decide({ cwd: mkdtempSync(join(tmpdir(), 'spaceport-changelog-')) }), null);
});

test('new doc without rows → block', () => {
  const { cwd, write } = repo();
  write(doc('R-01', []));
  const reply = decide({ cwd });
  assert.equal(reply.decision, 'block');
  assert.match(reply.reason, /001-x\/spec\.md has no changelog row/);
});

test('new doc with a row → allowed and snapshotted', () => {
  const { cwd, wo, write } = repo();
  write(doc('R-01', [row(1)]));
  assert.equal(decide({ cwd }), null);
  assert.equal(JSON.parse(readFileSync(join(wo, SNAPSHOT), 'utf8'))['spec.md'].rows, 1);
});

test('body change without a new row → block, until a row is added', () => {
  const { cwd, write } = repo();
  write(doc('R-01', [row(1)]));
  decide({ cwd });
  write(doc('R-01 changed', [row(1)]));
  assert.match(decide({ cwd }).reason, /changed without a new changelog row/);
  write(doc('R-01 changed', [row(1), row(2)]));
  assert.equal(decide({ cwd }), null);
});

test('line-ending only change is not a body change', () => {
  const { cwd, write } = repo();
  write(doc('R-01', [row(1)]));
  decide({ cwd });
  write(doc('R-01', [row(1)]).replace(/\n/g, '\r\n'));
  assert.equal(decide({ cwd }), null);
});

test('removed rows → block', () => {
  const { cwd, write } = repo();
  write(doc('R-01', [row(1), row(2)]));
  decide({ cwd });
  write(doc('R-01', [row(1)]));
  assert.match(decide({ cwd }).reason, /lost changelog rows/);
});

test('cli fails open on malformed input', () => {
  const result = spawnSync(process.execPath, [script], { input: 'not json', encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /guard-changelog skipped/);
});

test('cli prints the block decision', () => {
  const { cwd, wo, write } = repo();
  write(doc('R-01', []));
  const result = spawnSync(process.execPath, [script], { input: JSON.stringify({ cwd }), encoding: 'utf8' });
  assert.equal(JSON.parse(result.stdout).decision, 'block');
  assert.ok(existsSync(join(wo, SNAPSHOT)));
});

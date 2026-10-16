import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { body, changelogRows, checkDocs, requirements, shreds, testLines } from '../scripts/docs.mjs';

const script = fileURLToPath(new URL('../scripts/docs.mjs', import.meta.url));
const changelog = '## Changelog\n| Date | Step | Change | Why |\n|---|---|---|---|\n| 2026-10-14 | specs | Created | Draft approved |\n';

const intent = `---\nsize: feature\n---\n# Intent\n\nProblem.\n\n${changelog}`;
const spec = `# Spec\n\n### R-01: Add item\n- given…\n- Test: automated — AddTests\n\n### R-02: Remove item\n- given…\n- Test: manual — remove one\n\n${changelog}`;
const shredTable = (rows) => `# Plan\n\n## Shreds\n| # | Title | Requirements | Region | Depends on | UX |\n|---|---|---|---|---|---|\n${rows}\n\n${changelog}`;
const plan = shredTable('| 1 | Add | R-01 | src/add | — | none |\n| 2 | Remove | R-02 | src/remove | 1 | simple |');

function wo(docs) {
  const dir = mkdtempSync(join(tmpdir(), 'spaceport-docs-'));
  for (const [name, text] of Object.entries(docs)) writeFileSync(join(dir, name), text);
  return dir;
}

test('parses requirements, shreds and changelog rows', () => {
  assert.deepEqual(requirements(spec), ['R-01', 'R-02']);
  assert.deepEqual(shreds(plan)[1], { n: 2, title: 'Remove', reqs: ['R-02'], region: 'src/remove', deps: [1], ux: 'simple' });
  assert.equal(changelogRows(spec).length, 1);
  assert.ok(!body(spec).includes('2026-10-14'));
});

test('valid work order has no errors', () => {
  assert.deepEqual(checkDocs(wo({ 'intent.md': intent, 'spec.md': spec, 'plan.md': plan })), []);
});

test('empty folder has nothing to check', () => {
  assert.deepEqual(checkDocs(wo({})), []);
});

test('doc without a changelog row', () => {
  assert.deepEqual(checkDocs(wo({ 'spec.md': spec.replace(/\| 2026.*\n/, '') })), ['spec.md: no changelog row']);
});

test('intent needs a size', () => {
  assert.deepEqual(checkDocs(wo({ 'intent.md': intent.replace('feature', 'huge') })), ['intent.md: size must be feature|app']);
});

test('spec needs unique requirements', () => {
  assert.deepEqual(checkDocs(wo({ 'spec.md': `# Spec\n\n${changelog}` })), ['spec.md: no requirements (### R-01: ...)']);
  assert.deepEqual(checkDocs(wo({ 'spec.md': spec.replace('R-02', 'R-01') })), ['spec.md: R-01 is duplicated']);
});

test('every requirement says how it is tested', () => {
  const untested = spec.replace('- Test: manual — remove one', '- Test: someday');
  assert.deepEqual(checkDocs(wo({ 'spec.md': untested })), ['spec.md: R-02 has no "- Test: automated|manual" line']);
  const noFile = spec.replace('- Test: automated — AddTests', '- Test: automated');
  assert.deepEqual(checkDocs(wo({ 'spec.md': noFile })), ['spec.md: R-01 Test line names no test file']);
  assert.deepEqual(testLines(spec), { 'R-01': { kind: 'automated', file: 'AddTests' }, 'R-02': { kind: 'manual', file: null } });
  assert.deepEqual(testLines('### R-03: x\n- Test: automated — `tests/a.test.js`: adds\n')['R-03'].file, 'tests/a.test.js');
  const nextSection = `# Spec\n\n### R-01: Add\n- given…\n\n## Out of scope\n- Test: automated — not here\n\n${changelog}`;
  assert.deepEqual(checkDocs(wo({ 'spec.md': nextSection })), ['spec.md: R-01 has no "- Test: automated|manual" line']);
});

test('every requirement in exactly one shred, none unknown', () => {
  const twice = shredTable('| 1 | Add | R-01, R-02 | a | — | none |\n| 2 | Again | R-01, R-03 | b | — | none |');
  assert.deepEqual(checkDocs(wo({ 'spec.md': spec, 'plan.md': twice })), [
    'plan.md: R-01 in 2 shreds, expected 1',
    'plan.md: R-03 is not in spec.md',
  ]);
  const missing = shredTable('| 1 | Add | R-01 | a | — | none |');
  assert.deepEqual(checkDocs(wo({ 'spec.md': spec, 'plan.md': missing })), ['plan.md: R-02 in 0 shreds, expected 1']);
});

test('shred numbering, dependencies, UX and requirements', () => {
  const bad = shredTable('| 1 | A | R-01 | a | 2 | fancy |\n| 3 | B | | b | — | none |');
  assert.deepEqual(checkDocs(wo({ 'plan.md': bad })), [
    'plan.md shred 1: UX must be none|simple|deep',
    'plan.md shred 1: may only depend on earlier shreds, not 2',
    'plan.md shred 3: expected number 2',
    'plan.md shred 3: no requirements',
  ]);
});

test('plan without shreds', () => {
  assert.deepEqual(checkDocs(wo({ 'plan.md': `# Plan\n\n${changelog}` })), ['plan.md: no shreds in ## Shreds']);
});

test('cli check exits 1 on errors', () => {
  const result = spawnSync(process.execPath, [script, 'check', wo({ 'plan.md': `# Plan\n\n${changelog}` })], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
});

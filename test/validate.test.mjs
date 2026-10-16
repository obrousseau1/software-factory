import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBuild, dropShred, git, markBuilt, openShred, shredDir } from '../scripts/shred.mjs';
import { MAX_ROUNDS, startRound, summary, verdict } from '../scripts/validate.mjs';
import { getWorkOrder } from '../scripts/state.mjs';
import { ID, SEED_TEST, TEST_FILE, built, makeRepo, write } from './shred-repo.mjs';

const CLEAN = '| # | Severity | Where | Finding |\n|---|----------|-------|---------|\n';
const VALIDATORS = ['spec-validator', 'security-validator', 'standards-validator'];

const findings = (repo, round, rows = {}) => {
  for (const role of VALIDATORS) {
    write(shredDir(repo, ID, 1), `findings/r${round}-${role}.md`, CLEAN + (rows[role] ?? ''));
  }
};

const shred = (repo) => getWorkOrder(repo, ID).shreds[0];
const MAJOR = { 'spec-validator': '| 1 | Major | src/calc.js:1 | R-02 subtract missing |\n' };

// Fails a round, then the builder's fix round leaves the shred built again.
function failAndFix(repo, round) {
  startRound(repo, ID, 1);
  findings(repo, round, MAJOR);
  verdict(repo, ID, 1);
  assert.deepEqual(markBuilt(repo, ID, 1), { built: 1 });
}

test('round writes the diff and prompts each validator; ux skipped at none', () => {
  const { repo, worktree } = built();
  const { round, validators } = startRound(repo, ID, 1);
  assert.equal(round, 1);
  assert.deepEqual(validators.map((v) => v.agent), VALIDATORS.map((r) => `spaceport:${r}`));
  assert.match(validators[0].prompt, new RegExp(`Worktree: ${worktree.replaceAll('\\', '\\\\')}.*r1-spec-validator\\.md`));
  assert.match(readFileSync(join(shredDir(repo, ID, 1), 'diff-r1.patch'), 'utf8'), /R-02 subtracts/);
  assert.equal(shred(repo).status, 'validating');
});

test('each validator prompt carries only its own lessons', () => {
  const { repo } = built();
  write(repo, '.liftoff/lessons.md', '# Lessons\n- [builder] Put tests next to the code.\n- [spec-validator] Check R-xx clauses.\n');
  const [spec, security] = startRound(repo, ID, 1).validators;
  assert.match(spec.prompt, /Lessons from earlier work orders: Check R-xx clauses\.$/);
  assert.doesNotMatch(security.prompt, /Lessons/);
});

test('round refuses a shred that is not built', () => {
  const repo = makeRepo();
  openShred(repo, ID, 1);
  assert.throws(() => startRound(repo, ID, 1), /is work, not built/);
});

test('verdict refuses missing or malformed findings', () => {
  const { repo } = built();
  startRound(repo, ID, 1);
  assert.throws(() => verdict(repo, ID, 1), /Re-spawn these validators: missing/);
  findings(repo, 1, { 'security-validator': '| 1 | Bad | x | y |\n' });
  assert.throws(() => verdict(repo, ID, 1), /severity must be Critical\|Major\|Minor, not "Bad"/);
});

test('clean round lands the shred on the work-order branch', () => {
  const { repo, worktree } = built();
  startRound(repo, ID, 1);
  findings(repo, 1, { 'standards-validator': '| 1 | Minor | src/calc.js:1 | name |\n' });
  assert.deepEqual(verdict(repo, ID, 1), { pass: true, round: 1, landed: `spaceport/${ID}`, minor: 1 });
  assert.equal(shred(repo).status, 'landed');
  assert.ok(!existsSync(worktree));
  assert.match(git(repo, 'show', `spaceport/${ID}:${TEST_FILE}`), /R-02 subtracts/);
  assert.equal(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main');
  assert.deepEqual(summary(repo, ID).shreds[0].minor.map((m) => m.where), ['src/calc.js:1']);
});

test('blocking finding → back to work with a fix message for the builder, then round 2', () => {
  const { repo } = built();
  startRound(repo, ID, 1);
  findings(repo, 1, MAJOR);
  const result = verdict(repo, ID, 1);
  assert.deepEqual([result.pass, result.round, result.escalated, result.blocking], [false, 1, false, 1]);
  assert.equal(result.fix.split('\n')[1], 'F1-1 [Major] spec-validator: src/calc.js:1: R-02 subtract missing');
  assert.deepEqual([shred(repo).status, shred(repo).blocks], ['work', 0]);

  assert.deepEqual(markBuilt(repo, ID, 1), { built: 1 });
  assert.equal(startRound(repo, ID, 1).round, 2);
});

test(`round ${MAX_ROUNDS} failing escalates; no further round`, () => {
  const { repo } = built();
  failAndFix(repo, 1);
  failAndFix(repo, 2);
  startRound(repo, ID, 1);
  findings(repo, 3, MAJOR);
  assert.equal(verdict(repo, ID, 1).escalated, true);
  assert.equal(shred(repo).status, 'escalated');
  assert.throws(() => startRound(repo, ID, 1), /is escalated, not built/);
  assert.deepEqual(checkBuild(repo, ID, 1), ['Shred 1 is escalated: no build to check.']);
});

test('drop removes an escalated shred so it can be opened again', () => {
  const { repo, worktree } = built();
  dropShred(repo, ID, 1);
  assert.ok(!existsSync(worktree));
  assert.deepEqual(getWorkOrder(repo, ID).shreds, []);
  assert.ok(openShred(repo, ID, 1).worktree);
});

test('a shred not landed blocks opening another', () => {
  const { repo } = built();
  assert.throws(() => openShred(repo, ID, 2), /Shred 1 is built; one shred at a time/);
});

const LICENSE = '| 1 | Major | tests/calc.test.js:1 | seed test duplicates R-01 |\n\n## Remove\n\n### 1 tests/calc.test.js\n```js\nseed test line\n```\n';

test('Remove block licenses the fix round to delete exactly those test lines', () => {
  const { repo, worktree } = built();
  startRound(repo, ID, 1);
  findings(repo, 1, { 'standards-validator': LICENSE });
  assert.match(verdict(repo, ID, 1).fix, /F1-1 .*\(removal licensed\)$/m);
  assert.deepEqual(shred(repo).licenses, { [TEST_FILE]: [SEED_TEST] });

  write(worktree, TEST_FILE, 'R-02 subtracts\n');
  assert.ok(checkBuild(repo, ID, 1).some((e) => /removed committed test lines.*R-01 adds/.test(e)), 'unlicensed line flagged');
  write(worktree, TEST_FILE, 'R-01 adds\nR-02 subtracts\n');
  assert.deepEqual(checkBuild(repo, ID, 1), []);
  assert.deepEqual(markBuilt(repo, ID, 1), { built: 1 });
  assert.equal(shred(repo).licenses, undefined);
});

test('an unclosed Remove fence asks to re-spawn the validator, licensing nothing', () => {
  const { repo } = built();
  startRound(repo, ID, 1);
  findings(repo, 1, { 'standards-validator': LICENSE.replace(/```\n$/, '') });
  assert.throws(() => verdict(repo, ID, 1), /Re-spawn these validators: .*r1-standards-validator\.md: ## Remove has 1 blocks, 0 well-formed/);
  assert.equal(shred(repo).status, 'validating');
});

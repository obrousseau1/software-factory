import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { frontmatter } from '../scripts/frontmatter.mjs';
import { checkTurn, dropShred, git, handoffPath, nextTurn, openShred, shredDir } from '../scripts/shred.mjs';
import { MAX_ROUNDS, startRound, summary, verdict } from '../scripts/validate.mjs';
import { getWorkOrder } from '../scripts/state.mjs';
import { ID, SEED_TEST, TEST_FILE, makeRepo, setPhase, write } from './shred-repo.mjs';

const CLEAN = '| # | Severity | Where | Finding |\n|---|----------|-------|---------|\n';
const VALIDATORS = ['spec-validator', 'security-validator', 'standards-validator'];

// Shred 1 built by three twin turns; returns { repo, worktree }.
function built() {
  const repo = makeRepo();
  const { worktree } = openShred(repo, ID, 1);
  nextTurn(repo, ID, 1);
  write(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\nR-02 subtracts\n`);
  write(worktree, 'src/calc.js', 'export const add = (a, b) => a + b; // R-01\n');
  nextTurn(repo, ID, 1);
  setPhase(repo, 'BUILD');
  nextTurn(repo, ID, 1);
  setPhase(repo, 'REFACTOR');
  assert.deepEqual(nextTurn(repo, ID, 1), { done: true });
  return { repo, worktree };
}

const findings = (repo, round, rows = {}) => {
  for (const role of VALIDATORS) {
    write(shredDir(repo, ID, 1), `findings/r${round}-${role}.md`, CLEAN + (rows[role] ?? ''));
  }
};

const shred = (repo) => getWorkOrder(repo, ID).shreds[0];
const MAJOR = { 'spec-validator': '| 1 | Major | src/calc.js:1 | R-02 subtract missing |\n' };

// Fails a round, then completes the fix turn so the shred is built again.
function failAndFix(repo, round) {
  startRound(repo, ID, 1);
  findings(repo, round, MAJOR);
  verdict(repo, ID, 1);
  nextTurn(repo, ID, 1);
  const file = handoffPath(repo, ID, 1);
  write(shredDir(repo, ID, 1), 'handoff.md', readFileSync(file, 'utf8').replace(/\| open \|/g, '| rejected: out of scope |'));
  assert.deepEqual(nextTurn(repo, ID, 1), { done: true });
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
  write(repo, '.liftoff/lessons.md', '# Lessons\n- [twin] Put tests next to the code.\n- [spec-validator] Check R-xx clauses.\n');
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

test('blocking finding → open F doubt, fix turn by the other twin, blocked until resolved', () => {
  const { repo } = built();
  startRound(repo, ID, 1);
  findings(repo, 1, MAJOR);
  assert.deepEqual(verdict(repo, ID, 1), { pass: false, round: 1, escalated: false, blocking: 1 });

  const turn = nextTurn(repo, ID, 1);
  assert.deepEqual([turn.turn, turn.twin, turn.phases, turn.final], [3, 'B', ['CHALLENGE'], true]);
  assert.match(turn.prompt, /Phases: CHALLENGE findings r1\./);
  assert.equal(frontmatter(readFileSync(handoffPath(repo, ID, 1), 'utf8')).challenge, 'findings r1');
  assert.ok(checkTurn(repo, ID, 1).some((e) => /doubt F1-1/.test(e)));

  const file = handoffPath(repo, ID, 1);
  write(shredDir(repo, ID, 1), 'handoff.md', readFileSync(file, 'utf8').replace('| open |', '| fixed: added subtract |'));
  assert.deepEqual(nextTurn(repo, ID, 1), { done: true });
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
  assert.throws(() => nextTurn(repo, ID, 1), /is escalated/);
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

test('Remove block licenses the fix turn to delete exactly those test lines', () => {
  const { repo, worktree } = built();
  startRound(repo, ID, 1);
  findings(repo, 1, { 'standards-validator': LICENSE });
  verdict(repo, ID, 1);
  assert.deepEqual(shred(repo).licenses, { [TEST_FILE]: [SEED_TEST] });
  assert.match(readFileSync(handoffPath(repo, ID, 1), 'utf8'), /F1-1 .*\(removal licensed\) \| open/);

  nextTurn(repo, ID, 1);
  const file = handoffPath(repo, ID, 1);
  write(shredDir(repo, ID, 1), 'handoff.md', readFileSync(file, 'utf8').replace('| open |', '| fixed: removed |'));
  write(worktree, TEST_FILE, 'R-02 subtracts\n');
  assert.ok(checkTurn(repo, ID, 1).some((e) => /removed test lines.*R-01 adds/.test(e)), 'unlicensed line flagged');
  write(worktree, TEST_FILE, 'R-01 adds\nR-02 subtracts\n');
  assert.deepEqual(checkTurn(repo, ID, 1), []);
  assert.deepEqual(nextTurn(repo, ID, 1), { done: true });
  assert.equal(shred(repo).licenses, undefined);
});

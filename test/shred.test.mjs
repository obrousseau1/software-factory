import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { frontmatter } from '../scripts/frontmatter.mjs';
import { checkTurn, handoffPath, nextTurn, openShred, removedLines, shredDir, turnPlan } from '../scripts/shred.mjs';
import { getWorkOrder } from '../scripts/state.mjs';
import { ID, SEED_TEST, TEST_FILE, addDoubt, makeRepo, setPhase, write } from './shred-repo.mjs';

// Opens shred 1 and starts turn 0; returns the worktree.
function started(options) {
  const repo = makeRepo(options);
  const { worktree } = openShred(repo, ID, 1);
  nextTurn(repo, ID, 1);
  return { repo, worktree };
}

// Completes turn 0 (BUILD R-01) the way a twin would.
function buildR01(repo, worktree) {
  write(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\n`);
  write(worktree, 'src/calc.js', 'export const add = (a, b) => a + b; // R-01\n');
}

test('turnPlan rotates BUILD, then CHALLENGE + REFACTOR + BUILD, then a final challenge', () => {
  const reqs = ['R-01', 'R-02'];
  assert.deepEqual(turnPlan(reqs, 0), { twin: 'A', phases: ['BUILD'], challenge: null, build: 'R-01', final: false });
  assert.deepEqual(turnPlan(reqs, 1), { twin: 'B', phases: ['CHALLENGE', 'REFACTOR', 'BUILD'], challenge: 'R-01', build: 'R-02', final: false });
  assert.deepEqual(turnPlan(reqs, 2), { twin: 'A', phases: ['CHALLENGE', 'REFACTOR'], challenge: 'R-02', build: null, final: true });
});

test('removedLines ignores indentation, counts duplicates', () => {
  assert.deepEqual(removedLines('a\n  b\n', '  a\nb\nc'), []);
  assert.deepEqual(removedLines('a\na\n', 'a\n'), ['a']);
  assert.deepEqual(removedLines('a\n', null), ['a']);
});

test('open refuses a red base and leaves no worktree', () => {
  const repo = makeRepo({ red: true });
  assert.throws(() => openShred(repo, ID, 1), /Base is red, fix the repo first: gate test red: exit 1/);
  assert.deepEqual(getWorkOrder(repo, ID).shreds, []);
  assert.ok(!existsSync(join(repo, '..', 'repo.spaceport', `${ID}-1`)));
});

test('open refuses when setup fails', () => {
  const repo = makeRepo({ broken: true });
  assert.throws(() => openShred(repo, ID, 1), /Base is red, fix the repo first: setup failed: exit 1/);
  assert.deepEqual(getWorkOrder(repo, ID).shreds, []);
});

test('open creates a sibling worktree; one shred at a time', () => {
  const repo = makeRepo();
  const shred = openShred(repo, ID, 1);
  assert.equal(shred.worktree, join(repo, '..', 'repo.spaceport', `${ID}-1`));
  assert.ok(existsSync(join(shred.worktree, TEST_FILE)));
  assert.throws(() => openShred(repo, ID, 1), /already open/);
});

test('twin prompt carries only twin lessons', () => {
  const repo = makeRepo();
  write(repo, '.liftoff/lessons.md', '# Lessons\n- [twin] Put tests next to the code.\n- [spec-validator] Check R-xx clauses.\n');
  openShred(repo, ID, 1);
  const { prompt } = nextTurn(repo, ID, 1);
  assert.match(prompt, /Lessons from earlier work orders: Put tests next to the code\.$/);
  assert.doesNotMatch(prompt, /R-xx clauses/);
});

test('turn 0 writes the handoff and prints the twin prompt', () => {
  const repo = makeRepo();
  openShred(repo, ID, 1);
  const turn = nextTurn(repo, ID, 1);
  assert.match(turn.prompt, /Shred 1, turn 0, twin A\. Phases: BUILD R-01\./);
  const meta = frontmatter(readFileSync(handoffPath(repo, ID, 1), 'utf8'));
  assert.deepEqual([meta.turn, meta.phase, meta.build, meta.challenge], ['0', 'BUILD', 'R-01', 'none']);
});

test('a complete turn is committed, archived, and the next one starts', () => {
  const { repo, worktree } = started();
  buildR01(repo, worktree);
  assert.deepEqual(checkTurn(repo, ID, 1), []);
  const turn = nextTurn(repo, ID, 1);
  assert.match(turn.prompt, /twin B\. Phases: CHALLENGE R-01 → REFACTOR R-01 → BUILD R-02\./);
  assert.ok(existsSync(join(shredDir(repo, ID, 1), 'turns', '0.md')));
  assert.equal(frontmatter(readFileSync(handoffPath(repo, ID, 1), 'utf8')).phase, 'CHALLENGE');
});

test('turn refuses to advance while the turn is incomplete', () => {
  const { repo } = started();
  write(repo, '../repo.spaceport/001-calc-1/RED', '');
  assert.throws(() => nextTurn(repo, ID, 1), /Turn 0 is not complete: gate test red/);
});

test('removing a test line from an earlier turn is flagged', () => {
  const { repo, worktree } = started();
  buildR01(repo, worktree);
  nextTurn(repo, ID, 1);
  setPhase(repo, 'BUILD');
  write(worktree, TEST_FILE, 'R-02 only\n');
  assert.ok(checkTurn(repo, ID, 1).some((e) => /removed test lines.*seed test line/.test(e)));
});

test('deleting a test file is flagged', () => {
  const { repo, worktree } = started();
  rmSync(join(worktree, TEST_FILE));
  assert.ok(checkTurn(repo, ID, 1).some((e) => /calc\.test\.js: removed test lines/.test(e)));
});

test('phase must end at the last phase of the turn', () => {
  const { repo, worktree } = started();
  buildR01(repo, worktree);
  nextTurn(repo, ID, 1);
  assert.ok(checkTurn(repo, ID, 1).includes('handoff.md: finish every phase; phase must end at BUILD'));
});

test('an open doubt received must be resolved', () => {
  const { repo, worktree } = started();
  buildR01(repo, worktree);
  addDoubt(repo, '| D-1 | Negative numbers? | open |');
  nextTurn(repo, ID, 1);
  setPhase(repo, 'BUILD');
  assert.ok(checkTurn(repo, ID, 1).some((e) => /doubt D-1/.test(e)));
  write(repo, '.liftoff/wo/001-calc/shreds/1/handoff.md',
    readFileSync(handoffPath(repo, ID, 1), 'utf8').replace('| open |', '| rejected: out of scope |'));
  assert.ok(!checkTurn(repo, ID, 1).some((e) => /doubt/.test(e)));
});

test('writes outside the worktree are flagged', () => {
  const { repo, worktree } = started();
  buildR01(repo, worktree);
  write(repo, 'src/stray.js', 'x');
  assert.ok(checkTurn(repo, ID, 1).some((e) => /changed outside the worktree.*src\/stray\.js/.test(e)));
});

test('final turn needs every requirement tested and no TODO', () => {
  const { repo, worktree } = started();
  buildR01(repo, worktree);
  nextTurn(repo, ID, 1);
  setPhase(repo, 'BUILD');
  write(worktree, 'src/calc.js', 'export const add = (a, b) => a + b; // TODO R-02\n');
  nextTurn(repo, ID, 1);
  setPhase(repo, 'REFACTOR');
  const errors = checkTurn(repo, ID, 1);
  assert.ok(errors.includes('R-02: no changed test references it'), errors.join('\n'));
  assert.ok(errors.includes('src/calc.js: TODO / NotImplemented left in the diff'), errors.join('\n'));
});

test('final turn complete → shred built', () => {
  const { repo, worktree } = started();
  buildR01(repo, worktree);
  nextTurn(repo, ID, 1);
  setPhase(repo, 'BUILD');
  write(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\nR-02 subtracts\n`);
  nextTurn(repo, ID, 1);
  setPhase(repo, 'REFACTOR');
  assert.deepEqual(nextTurn(repo, ID, 1), { done: true });
  assert.equal(getWorkOrder(repo, ID).shreds[0].status, 'built');
});

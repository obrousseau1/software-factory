import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runGates } from '../scripts/gates.mjs';
import { checkBuild, git, markBuilt, openShred, removedLines } from '../scripts/shred.mjs';
import { getWorkOrder } from '../scripts/state.mjs';
import { ID, SEED_TEST, TEST_FILE, buildAll, makeRepo, write } from './shred-repo.mjs';

function opened(options) {
  const repo = makeRepo(options);
  const { worktree } = openShred(repo, ID, 1);
  return { repo, worktree };
}

const gateRuns = (worktree) => readFileSync(join(worktree, 'gate-runs'), 'utf8').length;

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

test('open prints the builder prompt, with only builder lessons', () => {
  const repo = makeRepo();
  write(repo, '.liftoff/lessons.md', '# Lessons\n- [builder] Put tests next to the code.\n- [reviewer] Check R-xx clauses.\n');
  const { agent, prompt } = openShred(repo, ID, 1);
  assert.equal(agent, 'spaceport:builder');
  assert.match(prompt, /Shred 1: build R-01, R-02\./);
  assert.match(prompt, /Lessons from earlier work orders: Put tests next to the code\.$/);
  assert.doesNotMatch(prompt, /R-xx clauses/);
  assert.equal(getWorkOrder(repo, ID).shreds[0].prompt, undefined);
});

test('an incomplete build: every requirement tested, no TODO', () => {
  const { repo, worktree } = opened();
  write(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\n`);
  write(worktree, 'src/calc.js', 'export const add = (a, b) => a + b; // TODO R-02\n');
  const errors = checkBuild(repo, ID, 1);
  assert.ok(errors.includes('R-02: no changed test references it'), errors.join('\n'));
  assert.ok(errors.includes('src/calc.js: TODO / NotImplemented left in the diff'), errors.join('\n'));
});

test('removing a committed test line is flagged; deleting the file too', () => {
  const { repo, worktree } = opened();
  write(worktree, TEST_FILE, 'R-01 adds\nR-02 subtracts\n');
  assert.ok(checkBuild(repo, ID, 1).some((e) => /removed committed test lines.*seed test line/.test(e)));
  rmSync(join(worktree, TEST_FILE));
  assert.ok(checkBuild(repo, ID, 1).some((e) => /calc\.test\.js: removed committed test lines/.test(e)));
});

test('writes outside the worktree are flagged', () => {
  const { repo, worktree } = opened();
  buildAll(worktree);
  write(repo, 'src/stray.js', 'x');
  assert.ok(checkBuild(repo, ID, 1).some((e) => /changed outside the worktree.*src\/stray\.js/.test(e)));
});

test('built refuses an incomplete build', () => {
  const { repo, worktree } = opened();
  buildAll(worktree);
  write(worktree, 'RED', '');
  assert.throws(() => markBuilt(repo, ID, 1), /Shred 1 is not complete: gate test red/);
  assert.equal(getWorkOrder(repo, ID).shreds[0].status, 'work');
});

test('a complete build is committed and the shred built', () => {
  const { repo, worktree } = opened();
  buildAll(worktree);
  assert.deepEqual(checkBuild(repo, ID, 1), []);
  assert.deepEqual(markBuilt(repo, ID, 1), { built: 1 });
  assert.equal(getWorkOrder(repo, ID).shreds[0].status, 'built');
  assert.match(git(worktree, 'log', '-1', '--format=%s'), /shred 1 build 1/);
  assert.equal(git(worktree, 'status', '--porcelain'), '');
  assert.deepEqual(checkBuild(repo, ID, 1), ['Shred 1 is built: no build to check.']);
});

test('gates of an unchanged tree are served from cache; any change runs them again', () => {
  const { repo, worktree } = opened();
  const base = gateRuns(worktree);
  assert.deepEqual(runGates(repo, worktree), []);
  assert.equal(gateRuns(worktree), base, 'open already ran them on this tree');
  write(worktree, 'src/calc.js', 'changed\n');
  runGates(repo, worktree);
  runGates(repo, worktree);
  assert.equal(gateRuns(worktree), base + 1);
  write(worktree, 'src/new.js', 'untracked\n');
  runGates(repo, worktree);
  assert.equal(gateRuns(worktree), base + 2);
  assert.equal(git(worktree, 'status', '--porcelain', '--', 'src/new.js').trim(), '?? src/new.js', 'index untouched');
});

test('a red gate is not cached', () => {
  const { repo, worktree } = opened();
  write(worktree, 'RED', '');
  const base = gateRuns(worktree);
  assert.match(runGates(repo, worktree)[0], /gate test red/);
  runGates(repo, worktree);
  assert.equal(gateRuns(worktree), base + 2);
});

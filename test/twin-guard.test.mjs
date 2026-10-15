import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide as guard } from '../scripts/guard-twin.mjs';
import { decide as stop } from '../scripts/guard-turn.mjs';
import { MAX_BLOCKS, handoffPath, nextTurn, openShred } from '../scripts/shred.mjs';
import { getWorkOrder, saveState } from '../scripts/state.mjs';
import { ID, SEED_TEST, TEST_FILE, makeRepo, setPhase, write } from './shred-repo.mjs';

const script = fileURLToPath(new URL('../scripts/guard-twin.mjs', import.meta.url));
const isDenied = (reply) => reply?.hookSpecificOutput.permissionDecision === 'deny';

// Shred 1 at turn 1 (CHALLENGE R-01 → REFACTOR → BUILD R-02); turn 0 committed SEED_TEST + an R-01 test.
function inTurn1() {
  const repo = makeRepo();
  const { worktree } = openShred(repo, ID, 1);
  nextTurn(repo, ID, 1);
  write(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\n`);
  nextTurn(repo, ID, 1);
  return { repo, worktree };
}

const twin = (worktree, toolInput) => ({ agent_type: 'spaceport:twin', cwd: worktree, tool_input: toolInput });
const writeIn = (worktree, rel, content) => twin(worktree, { file_path: join(worktree, rel), content });

test('other agents are not checked', () => {
  const { worktree } = inTurn1();
  assert.equal(guard({ ...writeIn(worktree, TEST_FILE, ''), agent_type: 'spaceport:architect' }), null);
});

test('writes outside the worktree are denied', () => {
  const { repo, worktree } = inTurn1();
  assert.ok(isDenied(guard(twin(worktree, { file_path: join(repo, 'src', 'calc.js'), content: 'x' }))));
});

test('the handoff may be written', () => {
  const { repo, worktree } = inTurn1();
  assert.equal(guard(twin(worktree, { file_path: handoffPath(repo, ID, 1), content: 'x' })), null);
});

test('a phase outside the turn is denied', () => {
  const { repo, worktree } = inTurn1();
  setPhase(repo, 'SHIP');
  assert.match(guard(writeIn(worktree, 'src/calc.js', 'x')).hookSpecificOutput.permissionDecisionReason, /CHALLENGE, REFACTOR, BUILD/);
});

test('REFACTOR may not touch a test file, but may change production code', () => {
  const { repo, worktree } = inTurn1();
  setPhase(repo, 'REFACTOR');
  assert.ok(isDenied(guard(writeIn(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\nmore\n`))));
  assert.equal(guard(writeIn(worktree, 'src/calc.js', 'refactored')), null);
});

test('CHALLENGE may add test lines, never remove an earlier turn\'s', () => {
  const { worktree } = inTurn1();
  assert.equal(guard(writeIn(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\nR-01 edge case\n`)), null);
  const edit = twin(worktree, { file_path: join(worktree, TEST_FILE), old_string: 'R-01 adds\n', new_string: '' });
  assert.match(guard(edit).hookSpecificOutput.permissionDecisionReason, /removes "R-01 adds"/);
});

test('BUILD: production code waits for a test referencing the requirement', () => {
  const { repo, worktree } = inTurn1();
  setPhase(repo, 'BUILD');
  assert.ok(isDenied(guard(writeIn(worktree, 'src/calc.js', 'sub'))));
  write(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\nR-02 subtracts\n`);
  assert.equal(guard(writeIn(worktree, 'src/calc.js', 'sub')), null);
});

test('no shred in work → denied', () => {
  const repo = makeRepo();
  assert.ok(isDenied(guard(writeIn(repo, 'src/calc.js', 'x'))));
});

test('cli denies on malformed input (fails closed)', () => {
  const result = spawnSync('node', [script], { input: 'not json', encoding: 'utf8' });
  assert.ok(isDenied(JSON.parse(result.stdout)));
});

test('stop is blocked while the turn is incomplete, at most MAX_BLOCKS times', () => {
  const { repo, worktree } = inTurn1();
  const input = { agent_type: 'twin', cwd: worktree };
  for (let i = 0; i < MAX_BLOCKS; i++) assert.match(stop(input).reason, /Turn 1 is not complete: handoff\.md: finish every phase/);
  assert.equal(stop(input), null);
  assert.equal(getWorkOrder(repo, ID).shreds[0].blocks, MAX_BLOCKS);
});

test('stop passes when the turn is complete; other agents never blocked', () => {
  const { repo, worktree } = inTurn1();
  setPhase(repo, 'BUILD');
  write(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\nR-02 subtracts\n`);
  assert.equal(stop({ agent_type: 'twin', cwd: worktree }), null);
  assert.equal(stop({ agent_type: 'architect', cwd: repo }), null);
  assert.ok(readFileSync(handoffPath(repo, ID, 1), 'utf8').includes('phase: BUILD'));
});

test('a validator-licensed test line may be removed; others still denied', () => {
  const { repo, worktree } = inTurn1();
  const state = getWorkOrder(repo, ID);
  saveState(repo, { ...state, shreds: state.shreds.map((s) => ({ ...s, licenses: { [TEST_FILE]: [SEED_TEST] } })) });
  assert.equal(guard(writeIn(worktree, TEST_FILE, 'R-01 adds\n')), null);
  assert.ok(isDenied(guard(writeIn(worktree, TEST_FILE, `${SEED_TEST}\n`))));
});

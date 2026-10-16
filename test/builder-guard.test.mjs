import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decideStop as stop, decideWrite as guard } from '../scripts/guard-builder.mjs';
import { MAX_BLOCKS, openShred } from '../scripts/shred.mjs';
import { getWorkOrder, saveState } from '../scripts/state.mjs';
import { ID, SEED_TEST, TEST_FILE, buildAll, makeRepo } from './shred-repo.mjs';

const script = fileURLToPath(new URL('../scripts/guard-builder.mjs', import.meta.url));
const isDenied = (reply) => reply?.hookSpecificOutput.permissionDecision === 'deny';

function opened() {
  const repo = makeRepo();
  const { worktree } = openShred(repo, ID, 1);
  return { repo, worktree };
}

const builder = (worktree, toolInput) => ({ agent_type: 'spaceport:builder', cwd: worktree, tool_input: toolInput });
const writeIn = (worktree, rel, content) => builder(worktree, { file_path: join(worktree, rel), content });

test('other agents are not checked', () => {
  const { worktree } = opened();
  assert.equal(guard({ ...writeIn(worktree, TEST_FILE, ''), agent_type: 'spaceport:architect' }), null);
  assert.equal(stop({ agent_type: 'architect', cwd: worktree }), null);
});

test('writes outside the worktree are denied; inside pass', () => {
  const { repo, worktree } = opened();
  assert.ok(isDenied(guard(builder(worktree, { file_path: join(repo, 'src', 'calc.js'), content: 'x' }))));
  assert.equal(guard(writeIn(worktree, 'src/calc.js', 'x')), null);
});

test('tests may grow, never lose a committed line', () => {
  const { worktree } = opened();
  assert.equal(guard(writeIn(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\n`)), null);
  const edit = builder(worktree, { file_path: join(worktree, TEST_FILE), old_string: SEED_TEST, new_string: '' });
  assert.match(guard(edit).hookSpecificOutput.permissionDecisionReason, /removes "seed test line"/);
});

test('a reviewer-licensed test line may be removed; others still denied', () => {
  const { repo, worktree } = opened();
  const state = getWorkOrder(repo, ID);
  saveState(repo, { ...state, shreds: state.shreds.map((s) => ({ ...s, licenses: { [TEST_FILE]: [SEED_TEST] } })) });
  assert.equal(guard(writeIn(worktree, TEST_FILE, 'R-01 adds\n')), null);
  saveState(repo, state);
  assert.ok(isDenied(guard(writeIn(worktree, TEST_FILE, 'R-01 adds\n'))));
});

test('no shred in work → denied', () => {
  const repo = makeRepo();
  assert.ok(isDenied(guard(writeIn(repo, 'src/calc.js', 'x'))));
});

test('cli: write denied on malformed input (fails closed)', () => {
  const result = spawnSync(process.execPath, [script], { input: 'not json', encoding: 'utf8' });
  assert.ok(isDenied(JSON.parse(result.stdout)));
});

test('stop is blocked while the build is incomplete, re-blocked up to MAX_BLOCKS', () => {
  const { repo, worktree } = opened();
  const input = { agent_type: 'spaceport:builder', cwd: worktree, hook_event_name: 'SubagentStop', stop_hook_active: true };
  for (let i = 0; i < MAX_BLOCKS; i++) assert.match(stop(input).reason, /Shred 1 is not complete: R-01: no changed test references it/);
  assert.equal(stop(input), null);
  assert.equal(getWorkOrder(repo, ID).shreds[0].blocks, MAX_BLOCKS);
});

test('stop passes when the build is complete', () => {
  const { worktree } = opened();
  buildAll(worktree);
  assert.equal(stop({ agent_type: 'builder', cwd: worktree }), null);
});

test('cli: stop lets go on malformed input (fails open)', () => {
  const result = spawnSync(process.execPath, [script], { input: '{"hook_event_name":"SubagentStop","cwd":"/nope","agent_type":"builder"}', encoding: 'utf8' });
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /guard-builder skipped/);
});

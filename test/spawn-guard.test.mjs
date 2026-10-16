import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../scripts/guard-spawn.mjs';
import { openShred } from '../scripts/shred.mjs';
import { saveState, getWorkOrder } from '../scripts/state.mjs';
import { ID, makeRepo } from './shred-repo.mjs';

const script = fileURLToPath(new URL('../scripts/guard-spawn.mjs', import.meta.url));
const spawn = (cwd, agent) => decide({ cwd, tool_input: { subagent_type: agent, prompt: 'x' } });
const isDenied = (reply) => reply?.hookSpecificOutput.permissionDecision === 'deny';

const withStatus = (repo, status) => {
  const state = getWorkOrder(repo, ID);
  saveState(repo, { ...state, shreds: state.shreds.map((s) => ({ ...s, status })) });
};

test('other agents always spawn', () => {
  assert.equal(spawn(makeRepo(), 'spaceport:explorer'), null);
  assert.equal(spawn(makeRepo(), 'general-purpose'), null);
});

test('builder spawns only while a shred is in work', () => {
  const repo = makeRepo();
  assert.ok(isDenied(spawn(repo, 'spaceport:builder')));
  openShred(repo, ID, 1);
  assert.equal(spawn(repo, 'builder'), null);
});

test('escalated shred: builder and reviewers denied (no extra round)', () => {
  const repo = makeRepo();
  openShred(repo, ID, 1);
  withStatus(repo, 'escalated');
  assert.ok(isDenied(spawn(repo, 'spaceport:builder')));
  assert.ok(isDenied(spawn(repo, 'spaceport:reviewer')));
});

test('reviewers spawn only while a shred is reviewing', () => {
  const repo = makeRepo();
  openShred(repo, ID, 1);
  assert.ok(isDenied(spawn(repo, 'spaceport:security-reviewer')));
  withStatus(repo, 'reviewing');
  assert.equal(spawn(repo, 'spaceport:security-reviewer'), null);
});

test('no work order in the repo: not a factory run, spawns pass', () => {
  const repo = makeRepo();
  rmSync(join(repo, '.liftoff', 'wo'), { recursive: true });
  assert.equal(spawn(repo, 'spaceport:reviewer'), null);
});

test('cli denies on malformed input (fails closed)', () => {
  const run = spawnSync(process.execPath, [script], { input: 'not json', encoding: 'utf8' });
  assert.ok(isDenied(JSON.parse(run.stdout)));
});

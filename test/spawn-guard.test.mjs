import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../scripts/guard-spawn.mjs';
import { nextTurn, openShred } from '../scripts/shred.mjs';
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

test('twin spawns only while a shred is in work', () => {
  const repo = makeRepo();
  assert.ok(isDenied(spawn(repo, 'spaceport:twin')));
  openShred(repo, ID, 1);
  nextTurn(repo, ID, 1);
  assert.equal(spawn(repo, 'twin'), null);
});

test('escalated shred: twin and validators denied (no 4th round)', () => {
  const repo = makeRepo();
  openShred(repo, ID, 1);
  withStatus(repo, 'escalated');
  assert.ok(isDenied(spawn(repo, 'spaceport:twin')));
  assert.ok(isDenied(spawn(repo, 'spaceport:spec-validator')));
});

test('validators spawn only while a shred is validating', () => {
  const repo = makeRepo();
  openShred(repo, ID, 1);
  assert.ok(isDenied(spawn(repo, 'spaceport:security-validator')));
  withStatus(repo, 'validating');
  assert.equal(spawn(repo, 'spaceport:security-validator'), null);
});

test('no work order in the repo: not a factory run, spawns pass', () => {
  const repo = makeRepo();
  rmSync(join(repo, '.liftoff', 'wo'), { recursive: true });
  assert.equal(spawn(repo, 'spaceport:spec-validator'), null);
});

test('cli denies on malformed input (fails closed)', () => {
  const run = spawnSync(process.execPath, [script], { input: 'not json', encoding: 'utf8' });
  assert.ok(isDenied(JSON.parse(run.stdout)));
});

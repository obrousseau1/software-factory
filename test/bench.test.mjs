import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { benchReport, benchRound, cost, openBench, testsPerReq } from '../scripts/bench.mjs';
import { decide as stopDecision } from '../scripts/guard-turn.mjs';
import { decide as spawnDecision } from '../scripts/guard-spawn.mjs';
import { render } from '../scripts/ledger.mjs';
import { git, shredDir } from '../scripts/shred.mjs';
import { getWorkOrder, saveState } from '../scripts/state.mjs';
import { startRound, verdict } from '../scripts/validate.mjs';
import { ID, TEST_FILE, built, write } from './shred-repo.mjs';

const CLEAN = '| # | Severity | Where | Finding |\n|---|----------|-------|---------|\n';
const VALIDATORS = ['spec-validator', 'security-validator', 'standards-validator'];
const PROFILE = { 'test-globs': 'tests/**' };

const findings = (repo, label, rows = {}) => {
  for (const role of VALIDATORS) write(shredDir(repo, ID, 1), `findings/${label}-${role}.md`, CLEAN + (rows[role] ?? ''));
};
const shred = (repo) => getWorkOrder(repo, ID).shreds[0];
const spawn = (repo, agent) => spawnDecision({ cwd: repo, tool_input: { subagent_type: agent, prompt: 'x' } });
const isDenied = (reply) => reply?.hookSpecificOutput.permissionDecision === 'deny';

// Shred 1 landed after one clean round.
function landed() {
  const { repo } = built();
  startRound(repo, ID, 1);
  findings(repo, 'r1');
  assert.equal(verdict(repo, ID, 1).pass, true);
  return repo;
}

const run = (agent, role, model, started, tokens) => ({ agent, role, model, started, seconds: 10, input: tokens, cacheWrite: 0, cacheRead: 0, output: tokens });

test('open refuses a shred not landed, or landed before M8', () => {
  const { repo } = built();
  assert.throws(() => openBench(repo, ID, 1), /not landed/);
  const old = landed();
  const state = getWorkOrder(old, ID);
  saveState(old, { ...state, shreds: state.shreds.map(({ opened, ...s }) => s) });
  assert.throws(() => openBench(old, ID, 1), /no opened \/ landedAt/);
});

test('open: solo worktree at the shred base, prompt names the requirements', () => {
  const repo = landed();
  const { agent, prompt } = openBench(repo, ID, 1);
  const { bench, base } = shred(repo);
  assert.equal(agent, 'spaceport:solo');
  assert.match(prompt, /build R-01, R-02\./);
  assert.equal(git(bench.worktree, 'rev-parse', 'HEAD').trim(), base);
  assert.throws(() => openBench(repo, ID, 1), /already benchmarked/);
});

test('solo is blocked until complete, at most 3 times; spawns follow the bench', () => {
  const repo = landed();
  assert.ok(isDenied(spawn(repo, 'spaceport:solo')));
  openBench(repo, ID, 1);
  assert.equal(spawn(repo, 'spaceport:solo'), null);
  assert.ok(isDenied(spawn(repo, 'spaceport:spec-validator')));
  assert.ok(isDenied(spawn(repo, 'spaceport:twin')));

  const stop = () => stopDecision({ agent_type: 'spaceport:solo', cwd: repo });
  for (let i = 0; i < 3; i++) assert.match(stop().reason, /R-01: no changed test references it/);
  assert.equal(stop(), null);

  const { incomplete } = benchRound(repo, ID, 1);
  assert.match(incomplete.join(), /R-02/);
  assert.equal(spawn(repo, 'spaceport:spec-validator'), null);
  assert.ok(isDenied(spawn(repo, 'spaceport:solo')));
});

test('round commits the solo build, writes its diff and solo findings prompts', () => {
  const repo = landed();
  openBench(repo, ID, 1);
  const { bench } = shred(repo);
  write(bench.worktree, TEST_FILE, 'seed test line\nR-01 adds\nR-02 subtracts\nR-02 negatives\n');
  assert.equal(stopDecision({ agent_type: 'spaceport:solo', cwd: repo }), null);

  const { incomplete, validators } = benchRound(repo, ID, 1);
  assert.deepEqual(incomplete, []);
  assert.equal(git(bench.worktree, 'status', '--porcelain'), '');
  assert.match(readFileSync(join(shredDir(repo, ID, 1), 'diff-solo.patch'), 'utf8'), /R-02 negatives/);
  assert.deepEqual(validators.map((v) => v.agent), VALIDATORS.map((r) => `spaceport:${r}`));
  assert.match(validators[0].prompt, /findings[\\/]solo-spec-validator\.md/);
  assert.doesNotMatch(validators[0].prompt, /Handoff/);
});

test('report: twins vs solo by time window, blocking, tests per requirement, cost', () => {
  const repo = landed();
  const { opened, landedAt } = shred(repo);
  openBench(repo, ID, 1);
  const { bench } = shred(repo);
  write(bench.worktree, TEST_FILE, 'seed test line\nR-01 adds\nR-02 subtracts\nR-02 negatives\n');
  benchRound(repo, ID, 1);
  findings(repo, 'solo', { 'spec-validator': '| 1 | Major | src/calc.js:1 | R-02 subtract missing |\n| 2 | Minor | x | y |\n' });
  write(repo, `.liftoff/wo/${ID}/ledger.md`, render([
    run('a0', 'architect', 'claude-opus-5-5', '2000-01-01T00:00:00Z', 1e6),
    run('a1', 'twin', 'claude-sonnet-5-5', opened, 1e6),
    run('a2', 'spec-validator', 'claude-sonnet-5-5', landedAt, 1e6),
    run('a3', 'solo', 'claude-sonnet-5-5', bench.opened, 1e6),
    run('a4', 'spec-validator', 'mystery', new Date().toISOString(), 1e6),
  ]));

  const { file, twins, solo } = benchReport(repo, ID, 1);
  assert.deepEqual([twins.runs, twins.tokens, twins.cost], [2, 4e6, 24]);
  assert.deepEqual([solo.runs, solo.seconds, Number.isNaN(solo.cost)], [2, 20, true]);
  assert.deepEqual([twins.blockingFirst, solo.blockingFirst, solo.minor], [0, 1, 1]);
  assert.deepEqual(twins.tests, { 'R-01': 1, 'R-02': 1 });
  assert.deepEqual(solo.tests, { 'R-01': 1, 'R-02': 2 });
  assert.match(readFileSync(file, 'utf8'), /\| Cost \$ \| 24\.00 \| \? \|/);
  assert.equal(shred(repo).bench.status, 'done');
});

test('report refuses until every solo findings file exists', () => {
  const repo = landed();
  openBench(repo, ID, 1);
  benchRound(repo, ID, 1);
  assert.throws(() => benchReport(repo, ID, 1), /Re-spawn these validators/);
  assert.equal(existsSync(join(shredDir(repo, ID, 1), 'bench.md')), false);
});

test('testsPerReq counts added test lines only; cost of an unknown model is NaN', () => {
  const patch = '+++ b/tests/a.test.js\n+R-01 one\n R-01 context\n-R-01 gone\n+++ b/src/a.js\n+R-01 code\n';
  assert.deepEqual(testsPerReq(patch, PROFILE, ['R-01', 'R-02']), { 'R-01': 1, 'R-02': 0 });
  assert.ok(Number.isNaN(cost(run('x', 'solo', 'unknown', '', 1))));
});

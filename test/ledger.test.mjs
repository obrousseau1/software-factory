import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usage } from '../scripts/costs.mjs';
import { currentWorkOrder, record } from '../scripts/ledger.mjs';
import { ID, makeRepo, write } from './shred-repo.mjs';

const script = fileURLToPath(new URL('../scripts/ledger.mjs', import.meta.url));
const ledger = (repo) => join(repo, '.liftoff', 'wo', ID, 'ledger.md');

const entry = (id, time, output, extra = {}) => JSON.stringify({
  type: 'assistant',
  timestamp: `2026-10-15T10:00:${time}.000Z`,
  message: { id, model: 'claude-sonnet-5-5', usage: { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: output, ...extra } },
});

// Today's transcript shape: one entry per content block, output_tokens growing within a message.
const TRANSCRIPT = [
  JSON.stringify({ type: 'user', timestamp: '2026-10-15T10:00:00.000Z', message: { content: 'go' } }),
  entry('m1', '01', 4),
  entry('m1', '02', 40),
  entry('m2', '05', 10),
  'not json',
  entry('m2', '30', 25),
].join('\n');

function stop(repo, agentId, agentType = 'spaceport:builder', transcript = TRANSCRIPT) {
  const path = join(repo, '..', `${agentId}.jsonl`);
  write(repo, join('..', `${agentId}.jsonl`), transcript);
  return record({ cwd: repo, agent_id: agentId, agent_type: agentType, agent_transcript_path: path });
}

test('usage keeps the last entry per message and times first to last entry', () => {
  assert.deepEqual(usage(TRANSCRIPT), {
    model: 'claude-sonnet-5-5', started: '2026-10-15T10:00:00.000Z', seconds: 30,
    input: 4, cacheWrite: 200, cacheRead: 2000, output: 65,
  });
});

test('one row per agent, rewritten on a later stop; totals per role', () => {
  const repo = makeRepo();
  stop(repo, 'a1');
  stop(repo, 'a2', 'spaceport:reviewer');
  stop(repo, 'a1', 'spaceport:builder', [TRANSCRIPT, entry('m3', '40', 5)].join('\n'));
  const md = readFileSync(ledger(repo), 'utf8');
  assert.equal(md.match(/^\| a1 \|/gm).length, 1);
  assert.match(md, /^\| a1 \| builder \| claude-sonnet-5-5 \| 2026-10-15T10:00:00\.000Z \| 40 \| 6 \| 300 \| 3000 \| 70 \|$/m);
  assert.match(md, /^\| builder \| 1 \| 40 \| 6 \| 300 \| 3000 \| 70 \|$/m);
  assert.match(md, /^\| \*\*All\*\* \| 2 \| 70 \| 10 \| 500 \| 5000 \| 135 \|$/m);
});

test('logs to the latest work order not approved at final', () => {
  const repo = makeRepo();
  write(repo, '.liftoff/wo/002-done/state.json', JSON.stringify({ id: '002-done', approvals: { final: {} } }));
  assert.equal(currentWorkOrder(repo), ID);
  write(repo, `.liftoff/wo/${ID}/state.json`, JSON.stringify({ id: ID, approvals: { final: {} } }));
  assert.equal(stop(repo, 'a1'), null);
});

test('logs to the work order whose shred is in progress, even when a later one is open', () => {
  const repo = makeRepo();
  write(repo, '.liftoff/wo/009-later/state.json', JSON.stringify({ id: '009-later', step: 'intent' }));
  assert.equal(currentWorkOrder(repo), '009-later');
  for (const shred of [{ n: 1, status: 'work' }, { n: 1, status: 'reviewing' }]) {
    write(repo, `.liftoff/wo/${ID}/state.json`, JSON.stringify({ id: ID, shreds: [shred] }));
    assert.equal(currentWorkOrder(repo), ID);
  }
});

test('hook fails open on a missing transcript', () => {
  const repo = makeRepo();
  const input = JSON.stringify({ cwd: repo, agent_id: 'a1', agent_type: 'builder', agent_transcript_path: join(repo, 'nope.jsonl') });
  const result = spawnSync(process.execPath, [script], { input, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.ok(!existsSync(ledger(repo)));
});

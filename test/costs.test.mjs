import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cost, reconcile, sessionOf } from '../scripts/costs.mjs';
import { usage } from '../scripts/ledger.mjs';

const SONNET = 'claude-sonnet-5-5';
const OPUS = 'claude-opus-5-5';

// One assistant message with snapshot usage, as a transcript line.
const message = (id, model, output) => JSON.stringify({
  type: 'assistant', timestamp: '2026-10-16T00:00:00Z',
  message: { id, model, usage: { input_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: output } },
});
const costState = (models) => JSON.stringify({ type: 'cost-state', modelUsage: models });

// Projects dir: closed session S1 (main on Opus, subagents a1 + a2 on Sonnet) and open session S2 (subagent a3).
function projects() {
  const root = mkdtempSync(join(tmpdir(), 'spaceport-projects-'));
  const write = (rel, lines) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), `${lines.join('\n')}\n`);
  };
  write('P/S1.jsonl', [message('m0', OPUS, 10), costState({ [OPUS]: { outputTokens: 30, costUSD: 1 }, [SONNET]: { outputTokens: 400, costUSD: 0.5 } })]);
  write('P/S1/subagents/agent-a1.jsonl', [message('m1', SONNET, 50)]);
  write('P/S1/subagents/agent-a2.jsonl', [message('m2', SONNET, 150)]);
  write('P/S2.jsonl', [message('m3', OPUS, 10)]);
  write('P/S2/subagents/agent-a3.jsonl', [message('m4', SONNET, 20)]);
  return root;
}

const run = (agent, output) => ({ agent, role: 'twin', ...usage(message(agent, SONNET, output)) });

test('runs are scaled to their session cost-state, per model', () => {
  const [a1, a2] = reconcile([run('a1', 50), run('a2', 150)], projects());
  assert.deepEqual([a1.output, a2.output], [100, 300]);
  assert.ok(Math.abs(a1.cost + a2.cost - 0.5) < 1e-9, 'sonnet $ sums to cost-state');
  assert.ok(a1.cost < a2.cost);
  assert.deepEqual([a1.reconciled, a2.reconciled], [true, true]);
});

test('a run of an open session, or of no known session, keeps its snapshot', () => {
  const root = projects();
  const [open, lost] = reconcile([run('a3', 20), run('zz', 5)], root);
  assert.deepEqual([open.output, open.reconciled, open.cost], [20, false, cost(open)]);
  assert.equal(lost.reconciled, false);
  assert.equal(sessionOf(root, 'zz'), null);
  assert.equal(sessionOf(join(root, 'missing'), 'a1'), null);
});

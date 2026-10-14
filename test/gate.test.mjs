import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recordGates } from '../scripts/record-gate.mjs';
import { getWorkOrder, newWorkOrder } from '../scripts/state.mjs';

const script = fileURLToPath(new URL('../scripts/record-gate.mjs', import.meta.url));

function setup() {
  const cwd = mkdtempSync(join(tmpdir(), 'spaceport-gate-'));
  const { id, path } = newWorkOrder(cwd, 'gated idea');
  const question = `[gate ${id} intent] Confirm the intent?`;
  const event = (answer) => ({
    cwd,
    tool_input: { questions: [{ question }] },
    tool_response: { answers: { [question]: answer } },
  });
  return { cwd, id, path, event };
}

test('approve answer records the gate and logs it', () => {
  const { cwd, id, path, event } = setup();
  assert.deepEqual(recordGates(event('Approve')), ['intent']);
  assert.ok(getWorkOrder(cwd, id).approvals.intent);
  assert.match(readFileSync(join(path, 'gates.log'), 'utf8'), /intent: Approve/);
});

test('change answer is logged, not approved', () => {
  const { cwd, id, path, event } = setup();
  assert.deepEqual(recordGates(event('Change: drop the export')), []);
  assert.equal(getWorkOrder(cwd, id).approvals, undefined);
  assert.match(readFileSync(join(path, 'gates.log'), 'utf8'), /intent: Change: drop the export/);
});

test('answers in tool_input are read too', () => {
  const { event } = setup();
  const input = event('Approve');
  input.tool_input.answers = input.tool_response.answers;
  delete input.tool_response;
  assert.deepEqual(recordGates(input), ['intent']);
});

test('untagged questions are ignored', () => {
  const { cwd } = setup();
  const input = { cwd, tool_input: { questions: [{ question: 'Approve?' }] }, tool_response: { answers: { 'Approve?': 'Approve' } } };
  assert.deepEqual(recordGates(input), []);
});

test('cli never fails the tool call', () => {
  const result = spawnSync(process.execPath, [script], { input: 'not json', encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /record-gate failed/);
});

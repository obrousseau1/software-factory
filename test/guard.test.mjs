import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from '../scripts/guard-readonly.mjs';

const script = fileURLToPath(new URL('../scripts/guard-readonly.mjs', import.meta.url));
const cwd = join(process.cwd(), 'repo');
const input = (agentType, path) => ({ agent_type: agentType, cwd, tool_input: { file_path: path } });
const isDenied = (reply) => reply?.hookSpecificOutput.permissionDecision === 'deny';

test('profiler may write the profile', () => {
  assert.equal(decide(input('profiler', '.liftoff/profile.md')), null);
});

test('profiler may write the profile by absolute path', () => {
  assert.equal(decide(input('spaceport:profiler', join(cwd, '.liftoff', 'profile.md'))), null);
});

test('profiler may write under proposals', () => {
  assert.equal(decide(input('spaceport:profiler', '.liftoff/proposals/go/stack.md')), null);
});

test('profiler may not write source files', () => {
  assert.ok(isDenied(decide(input('spaceport:profiler', 'src/App.cs'))));
});

test('profiler may not escape through ..', () => {
  assert.ok(isDenied(decide(input('profiler', '.liftoff/proposals/../state.json'))));
});

test('profiler may not write a look-alike of the profile', () => {
  assert.ok(isDenied(decide(input('profiler', '.liftoff/profile.md.bak'))));
});

test('notebook path is checked too', () => {
  const reply = decide({ agent_type: 'profiler', cwd, tool_input: { notebook_path: 'a.ipynb' } });
  assert.ok(isDenied(reply));
});

test('main session and other agents are not restricted', () => {
  assert.equal(decide(input(undefined, 'src/App.cs')), null);
  assert.equal(decide(input('spaceport:twin', 'src/App.cs')), null);
});

test('profiler without a target path is denied', () => {
  assert.ok(isDenied(decide({ agent_type: 'profiler', cwd, tool_input: {} })));
});

test('cli denies on malformed input (fails closed)', () => {
  const result = spawnSync('node', [script], { input: 'not json', encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(isDenied(JSON.parse(result.stdout)));
});

test('cli prints nothing when allowed', () => {
  const result = spawnSync('node', [script], { input: JSON.stringify(input('profiler', '.liftoff/profile.md')), encoding: 'utf8' });
  assert.equal(result.stdout, '');
});

test('explorer may not write anything, not even the profile', () => {
  assert.ok(isDenied(decide(input('spaceport:explorer', '.liftoff/profile.md'))));
});

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

test('architect may not write anything', () => {
  assert.ok(isDenied(decide(input('spaceport:architect', '.liftoff/wo/001-x/drafts/spec.md'))));
});

test('no subagent may write a living doc, even from a worktree', () => {
  assert.ok(isDenied(decide(input('spaceport:twin', '.liftoff/wo/001-x/spec.md'))));
  assert.ok(isDenied(decide(input('twin', join(cwd, '.liftoff', 'wo', '001-x', 'plan.md')))));
  const worktree = join(cwd, '..', 'wt-1');
  const fromWorktree = { agent_type: 'twin', cwd: worktree, tool_input: { file_path: join(cwd, '.liftoff/wo/001-x/intent.md') } };
  assert.ok(isDenied(decide(fromWorktree)));
});

test('nobody hand-edits script-owned state, not even the main session', () => {
  for (const file of ['state.json', 'gates.log', '.changelog.json']) {
    assert.ok(isDenied(decide(input(undefined, `.liftoff/wo/001-x/${file}`))), file);
    assert.ok(isDenied(decide(input('twin', `.liftoff/wo/001-x/${file}`))), file);
  }
});

test('main session may write living docs; twins other .liftoff files', () => {
  assert.equal(decide(input(undefined, '.liftoff/wo/001-x/spec.md')), null);
  assert.equal(decide(input('twin', '.liftoff/wo/001-x/shreds/1/handoff.md')), null);
});

test('explorer may not write anything, not even the profile', () => {
  assert.ok(isDenied(decide(input('spaceport:explorer', '.liftoff/profile.md'))));
});

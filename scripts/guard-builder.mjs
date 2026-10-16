// Builder hooks (design §4).
// PreToolUse (Edit / Write): writes stay in the active shred's worktree and never remove a committed test line
// (the base's, or an earlier round's) unless a reviewer licensed it. Fails closed.
// SubagentStop: blocks the stop while shred.mjs checkBuild fails, at most MAX_BLOCKS per build, then lets go:
// `shred.mjs built` still refuses an incomplete build. Fails open: a crash must not trap the builder.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isTest, profilePath, readProfile } from './profile.mjs';
import { Role, bare } from './roles.mjs';
import { MAX_BLOCKS, activeShred, checkBuild, mainRepo, saveShred, showAt, testRemovals } from './shred.mjs';

const deny = (reason) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
});

// File content once the Edit / Write applies. An Edit whose old_string is absent changes nothing (the tool fails).
function contentAfter(toolInput, file) {
  if (toolInput.content !== undefined) return toolInput.content;
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const { old_string: from = '', new_string: to = '', replace_all: all } = toolInput;
  if (!from) return current;
  return all ? current.replaceAll(from, to) : current.replace(from, () => to);
}

// PreToolUse reply, or null to let the write through.
export function decideWrite(input) {
  if (bare(input.agent_type) !== Role.Builder) return null;
  const active = activeShred(mainRepo(input.cwd));
  if (!active) return deny('builder: no shred is in work; stop and report.');
  const { shred } = active;

  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!target) return deny('builder: cannot resolve the target path, write denied.');
  const file = resolve(input.cwd, target);
  const rel = relative(shred.worktree, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return deny(`builder: stay in the worktree ${shred.worktree}.`);

  const path = rel.replaceAll('\\', '/');
  if (!isTest(readProfile(profilePath(mainRepo(input.cwd))), path)) return null;
  const removed = testRemovals(shred, path, showAt(shred.worktree, 'HEAD', path), contentAfter(input.tool_input, file));
  return removed.length ? deny(`builder: never delete or weaken a committed test; this removes "${removed[0]}".`) : null;
}

// SubagentStop reply, or null to let the builder stop.
export function decideStop(input) {
  if (bare(input.agent_type) !== Role.Builder) return null;
  const repo = mainRepo(input.cwd);
  const active = activeShred(repo);
  if (!active || (active.shred.blocks ?? 0) >= MAX_BLOCKS) return null;
  const { state, shred } = active;
  const errors = checkBuild(repo, state.id, shred.n);
  if (!errors.length) return null;
  saveShred(repo, state, { ...shred, blocks: (shred.blocks ?? 0) + 1 });
  return { decision: 'block', reason: `Shred ${shred.n} is not complete: ${errors.join('; ')}` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
    const reply = input.hook_event_name === 'SubagentStop' ? decideStop(input) : decideWrite(input);
    if (reply) console.log(JSON.stringify(reply));
  } catch (error) {
    if (input?.hook_event_name === 'SubagentStop') console.error(`guard-builder skipped: ${error.message}`);
    else console.log(JSON.stringify(deny(`guard-builder failed (${error.message}), write denied.`)));
  }
}

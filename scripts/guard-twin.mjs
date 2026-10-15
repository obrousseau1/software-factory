// PreToolUse hook (twin): writes stay in the active shred's worktree (plus its handoff.md) and follow the
// phase in handoff.md (design §4). No phase may remove a test line committed by an earlier turn. Fails closed.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { frontmatter } from './frontmatter.mjs';
import { isTest, profilePath, readProfile } from './profile.mjs';
import { Role, bare } from './roles.mjs';
import { Phase, activeShred, changes, handoffPath, mainRepo, removedLines, showAt } from './shred.mjs';

const deny = (reason) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
});

const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

// File content once the Edit / Write applies. An Edit whose old_string is absent changes nothing (the tool fails).
function contentAfter(toolInput, file) {
  if (toolInput.content !== undefined) return toolInput.content;
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const { old_string: from = '', new_string: to = '', replace_all: all } = toolInput;
  if (!from) return current;
  return all ? current.replaceAll(from, to) : current.replace(from, () => to);
}

// Returns the hook's JSON reply, or null to let the call through.
export function decide(input) {
  if (bare(input.agent_type) !== Role.Twin) return null;
  const repo = mainRepo(input.cwd);
  const active = activeShred(repo);
  if (!active) return deny('twin: no shred is in work; stop and report.');
  const { state, shred } = active;

  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!target) return deny('twin: cannot resolve the target path, write denied.');
  const file = resolve(input.cwd, target);
  const handoff = handoffPath(repo, state.id, shred.n);
  if (same(file, handoff)) return null;

  const rel = relative(shred.worktree, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return deny(`twin: stay in the worktree ${shred.worktree}.`);

  const phase = frontmatter(readFileSync(handoff, 'utf8')).phase;
  if (!shred.phases.includes(phase)) return deny(`twin: set phase in handoff.md to one of ${shred.phases.join(', ')}.`);

  const path = rel.replaceAll('\\', '/');
  const profile = readProfile(profilePath(repo));
  if (isTest(profile, path)) {
    if (phase === Phase.Refactor) return deny('twin: REFACTOR may not touch test files.');
    const removed = removedLines(showAt(shred.worktree, 'HEAD', path), contentAfter(input.tool_input, file));
    if (removed.length) return deny(`twin: never delete or weaken an earlier turn's test; this removes "${removed[0]}".`);
    return null;
  }

  if (phase !== Phase.Build) return null;
  const tested = changes(shred.worktree, 'HEAD')
    .some(({ path: changed, after }) => after?.includes(shred.build) && isTest(profile, changed));
  return tested ? null : deny(`twin: BUILD writes a failing test referencing ${shred.build} before production code.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let reply;
  try {
    reply = decide(JSON.parse(readFileSync(0, 'utf8')));
  } catch (error) {
    reply = deny(`guard-twin failed (${error.message}), write denied.`);
  }
  if (reply) console.log(JSON.stringify(reply));
}

// PreToolUse hook: restricted roles may write only their allowed paths (roles.mjs WRITE_LIMITS); no subagent
// may write a living doc (intent/spec/plan.md); nobody may hand-edit script-owned state. Fails closed.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WRITE_LIMITS, bare } from './roles.mjs';

const deny = (reason) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
});

const normalize = (path) => {
  const posix = path.replaceAll('\\', '/');
  return process.platform === 'win32' ? posix.toLowerCase() : posix;
};

// Matched on the absolute path: a twin in a worktree still targets the main repo's `.liftoff/`.
const LIVING_DOC = /(^|\/)\.liftoff\/wo\/[^/]+\/(intent|spec|plan)\.md$/;
// Script-owned: approvals and snapshots must not be hand-edited, by liftoff either.
const SCRIPT_OWNED = /(^|\/)\.liftoff\/wo\/[^/]+\/(state\.json|gates\.log|\.changelog\.json)$/;

function isAllowed(rel, allowed) {
  return allowed.map(normalize).some((path) => path.endsWith('/') ? rel.startsWith(path) : rel === path);
}

// Returns the hook's JSON reply, or null to let the call through.
export function decide(input) {
  const role = bare(input.agent_type);
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  const absolute = target && input.cwd ? resolve(input.cwd, target) : null;
  if (absolute && SCRIPT_OWNED.test(normalize(absolute))) return deny('Written by spaceport scripts only (state.mjs, hooks).');
  if (!role) return null;
  const allowed = WRITE_LIMITS[role];

  if (!absolute) return deny(`${role}: cannot resolve the target path, write denied.`);

  if (LIVING_DOC.test(normalize(absolute))) return deny(`${role}: living docs belong to liftoff; report the change instead.`);

  const rel = normalize(relative(input.cwd, absolute));
  if (!allowed || isAllowed(rel, allowed)) return null;
  return deny(`${role} is read-only; it may only write ${allowed.join(', ') || 'nothing'}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let reply;
  try {
    reply = decide(JSON.parse(readFileSync(0, 'utf8')));
  } catch (error) {
    reply = deny(`guard-readonly failed (${error.message}), write denied.`);
  }
  if (reply) console.log(JSON.stringify(reply));
}

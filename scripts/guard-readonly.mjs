// PreToolUse hook: restricted roles may write only their allowed paths (roles.mjs WRITE_LIMITS); no subagent
// may write a living doc (intent/spec/plan.md); nobody may hand-edit script-owned state; liftoff never writes in an
// open shred's worktree (twins own it). Fails closed.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WRITE_LIMITS, bare } from './roles.mjs';
import { getWorkOrder, woRoot } from './state.mjs';

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
const SCRIPT_OWNED = /(^|\/)\.liftoff\/wo\/[^/]+\/(state\.json|gates\.log|\.changelog\.json|ledger\.md)$/;

function isAllowed(rel, allowed) {
  return allowed.some((path) => {
    if (path instanceof RegExp) return path.test(rel);
    const norm = normalize(path);
    return norm.endsWith('/') ? rel.startsWith(norm) : rel === norm;
  });
}

// Inside the worktree of a shred not yet landed.
function inShredWorktree(repo, absolute) {
  const root = woRoot(repo);
  if (!existsSync(root)) return false;
  return readdirSync(root)
    .filter((id) => existsSync(join(root, id, 'state.json')))
    .flatMap((id) => getWorkOrder(repo, id).shreds ?? [])
    .filter((shred) => shred.status !== 'landed' && shred.worktree)
    .some((shred) => {
      const rel = relative(shred.worktree, absolute);
      return rel && !rel.startsWith('..') && !isAbsolute(rel);
    });
}

// Returns the hook's JSON reply, or null to let the call through.
export function decide(input) {
  const role = bare(input.agent_type);
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  const absolute = target && input.cwd ? resolve(input.cwd, target) : null;
  if (absolute && SCRIPT_OWNED.test(normalize(absolute))) return deny('Written by spaceport scripts only (state.mjs, hooks).');
  if (!role) {
    const liftoffInWorktree = absolute && inShredWorktree(input.cwd, absolute);
    return liftoffInWorktree ? deny('liftoff never writes code: twins own the shred worktree. Route the change through a twin turn or ask the user.') : null;
  }
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

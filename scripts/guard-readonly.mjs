// PreToolUse hook: restricted roles may write only their allowed paths (roles.mjs WRITE_LIMITS). Fails closed.
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

function isAllowed(rel, allowed) {
  return allowed.map(normalize).some((path) => path.endsWith('/') ? rel.startsWith(path) : rel === path);
}

// Returns the hook's JSON reply, or null to let the call through.
export function decide(input) {
  const role = bare(input.agent_type);
  const allowed = WRITE_LIMITS[role];
  if (!allowed) return null;

  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!target || !input.cwd) return deny(`${role}: cannot resolve the target path, write denied.`);

  const rel = normalize(relative(input.cwd, resolve(input.cwd, target)));
  if (isAllowed(rel, allowed)) return null;
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

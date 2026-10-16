// PreToolUse hook on Agent: the builder spawns only while a shred is in work, a reviewer only while one is reviewing.
// An escalated shred (round cap reached, design §2) is neither, so no extra round. A repo with no work order is not a
// factory run: nothing to guard. Fails closed for those roles.
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { REVIEWERS, Role, bare } from './roles.mjs';
import { mainRepo, shredWith } from './shred.mjs';
import { woRoot } from './state.mjs';

const deny = (reason) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
});

// Returns the hook's JSON reply, or null to let the spawn through.
export function decide(input) {
  const role = bare(input.tool_input?.subagent_type);
  const status = role === Role.Builder ? 'work' : REVIEWERS.includes(role) ? 'reviewing' : null;
  if (!status) return null;
  const repo = mainRepo(input.cwd);
  if (!existsSync(woRoot(repo))) return null;
  if (shredWith(repo, status)) return null;
  return deny(`${role}: no shred is ${status === 'work' ? 'in work' : 'reviewing'}. Run shred.mjs / review.mjs first; an escalated shred needs the user.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let reply;
  try {
    reply = decide(JSON.parse(readFileSync(0, 'utf8')));
  } catch (error) {
    reply = deny(`guard-spawn failed (${error.message}), spawn denied.`);
  }
  if (reply) console.log(JSON.stringify(reply));
}

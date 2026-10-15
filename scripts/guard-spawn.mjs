// PreToolUse hook on Agent: a twin spawns only while a shred is in work, a validator only while one is validating.
// An escalated shred (round cap reached, design §2) is neither, so no 4th round. A repo with no work order is not a
// factory run: nothing to guard. Fails closed for those roles.
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Role, VALIDATORS, bare } from './roles.mjs';
import { mainRepo, shredWith } from './shred.mjs';
import { woRoot } from './state.mjs';

const deny = (reason) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
});

// Returns the hook's JSON reply, or null to let the spawn through.
export function decide(input) {
  const role = bare(input.tool_input?.subagent_type);
  const status = role === Role.Twin ? 'work' : VALIDATORS.includes(role) ? 'validating' : null;
  if (!status) return null;
  const repo = mainRepo(input.cwd);
  if (!existsSync(woRoot(repo)) || shredWith(repo, status)) return null;
  return deny(`${role}: no shred is ${status === 'work' ? 'in work' : 'validating'}. Run shred.mjs / validate.mjs first; an escalated shred needs the user.`);
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

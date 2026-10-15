// SubagentStop hook (twin): blocks the stop while the turn fails shred.mjs checkTurn (handoff, doubts, test
// lines, stray edits, shred completeness on the final turn, gates). At most MAX_BLOCKS per turn, then lets go:
// `shred.mjs turn` still refuses to advance. Fails open: a crash must not trap the twin.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Role, bare } from './roles.mjs';
import { MAX_BLOCKS, activeShred, checkTurn, mainRepo, saveShred } from './shred.mjs';

// Returns the hook's JSON reply, or null to let the twin stop.
export function decide(input) {
  if (bare(input.agent_type) !== Role.Twin) return null;
  const repo = mainRepo(input.cwd);
  const active = activeShred(repo);
  if (!active || (active.shred.blocks ?? 0) >= MAX_BLOCKS) return null;
  const { state, shred } = active;

  const errors = checkTurn(repo, state.id, shred.n);
  if (!errors.length) return null;
  saveShred(repo, state, { ...shred, blocks: (shred.blocks ?? 0) + 1 });
  return { decision: 'block', reason: `Turn ${shred.turn} is not complete: ${errors.join('; ')}` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const reply = decide(JSON.parse(readFileSync(0, 'utf8')));
    if (reply) console.log(JSON.stringify(reply));
  } catch (error) {
    console.error(`guard-turn skipped: ${error.message}`);
  }
}

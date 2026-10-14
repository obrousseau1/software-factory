// PostToolUse hook on AskUserQuestion: a question tagged `[gate <wo-id> <gate>]` answered "Approve…" records
// the approval in state.json (state.mjs approve). Only the user's answer, never liftoff, writes approvals.
// Every tagged answer is appended to the work order's gates.log, approved or not.
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { approve, woRoot } from './state.mjs';

const TAG = /^\[gate (\S+) (\w+)\]/;
const APPROVED = /^approve\b/i;

// The result, not tool_input: input answers could be pre-filled by the model; the result is what the user picked.
const answersOf = (input) => input.tool_response?.answers ?? {};

// Returns the gates approved by this answer set.
export function recordGates(input, now = new Date()) {
  const answers = answersOf(input);
  const approved = [];
  for (const { question } of input.tool_input?.questions ?? []) {
    const tag = question.match(TAG);
    if (!tag) continue;
    const [, id, gate] = tag;
    const answer = String(answers[question] ?? '');
    appendFileSync(join(woRoot(input.cwd), id, 'gates.log'), `${now.toISOString()} ${gate}: ${answer || '(no answer)'}\n`);
    if (APPROVED.test(answer)) {
      approve(input.cwd, id, gate, now);
      approved.push(gate);
    }
  }
  return approved;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    recordGates(JSON.parse(readFileSync(0, 'utf8')));
  } catch (error) {
    console.error(`record-gate failed: ${error.message}`);
  }
}

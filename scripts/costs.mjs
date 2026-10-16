// True output tokens and $ of ledger runs. Transcripts keep a stream-start snapshot of output_tokens; the `cost-state`
// entry a session writes when it ends holds the true per-model totals. Each run is scaled to its session's totals.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { usage } from './ledger.mjs';

export const PROJECTS = join(homedir(), '.claude', 'projects');
// ponytail: $/MTok as of 2026-10 (claude-api skill), 5-minute cache writes; only weights runs within a reconciled
// session. Unknown model → NaN.
const PRICES = {
  'claude-opus-5-5': { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  'claude-sonnet-5-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
};
export const TOKENS = ['input', 'cacheWrite', 'cacheRead', 'output'];
export const tokens = (run, weight = () => 1) => TOKENS.reduce((total, key) => total + run[key] * weight(key), 0);

// $ of one run from the price table; NaN when its model has no price.
export function cost(run) {
  const price = PRICES[run.model];
  return price ? tokens(run, (key) => price[key]) / 1e6 : NaN;
}

// Main transcript of the session that ran subagent `agentId`, or null.
export function sessionOf(projects, agentId) {
  if (!existsSync(projects)) return null;
  for (const project of readdirSync(projects)) {
    const dir = join(projects, project);
    const session = readdirSync(dir).find((name) => existsSync(join(dir, name, 'subagents', `agent-${agentId}.jsonl`)));
    if (session) return join(dir, `${session}.jsonl`);
  }
  return null;
}

// The session's last cost-state, per model: { <model>: { outputTokens, costUSD, … } }; null while it is still open.
export function truth(session) {
  const line = readFileSync(session, 'utf8').split(/\r?\n/).findLast((l) => l.includes('"type":"cost-state"'));
  return line ? JSON.parse(line).modelUsage : null;
}

// Snapshot totals per model over the session and its subagents: { <model>: { output, cost } }.
export function recorded(session) {
  const dir = join(session.replace(/\.jsonl$/, ''), 'subagents');
  const subagents = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f)) : [];
  const totals = {};
  for (const run of [session, ...subagents].map((file) => usage(readFileSync(file, 'utf8')))) {
    const total = (totals[run.model] ??= { output: 0, cost: 0 });
    total.output += run.output;
    total.cost += cost(run);
  }
  return totals;
}

// Runs with true `output` and `cost`, scaled per (session, model); `reconciled: false` keeps the snapshot.
export function reconcile(runs, projects = PROJECTS) {
  const facts = new Map();
  const factsOf = (session) => {
    if (!facts.has(session)) facts.set(session, { truth: truth(session), recorded: recorded(session) });
    return facts.get(session);
  };
  return runs.map((run) => {
    const session = sessionOf(projects, run.agent);
    const { truth: real, recorded: logged } = session ? factsOf(session) : {};
    const t = real?.[run.model];
    const r = logged?.[run.model];
    if (!t || !(r?.output > 0) || !(r.cost > 0)) return { ...run, cost: cost(run), reconciled: false };
    return { ...run, output: Math.round(run.output * t.outputTokens / r.output), cost: cost(run) * t.costUSD / r.cost, reconciled: true };
  });
}

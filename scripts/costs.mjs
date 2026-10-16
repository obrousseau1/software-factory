// Token usage of agent runs, and their true output tokens and $. Transcripts keep a stream-start snapshot of
// output_tokens; the `cost-state` entry a session writes when it ends holds the true per-model totals. Each run is
// scaled to its session's totals.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Transcript JSONL → usage. An assistant message repeats once per content block with growing output_tokens:
// keep the last entry per message id.
export function usage(jsonl) {
  const messages = new Map();
  let first, last, model;
  for (const line of jsonl.split(/\r?\n/)) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.timestamp) [first, last] = [first ?? entry.timestamp, entry.timestamp];
    const message = entry.type === 'assistant' ? entry.message : null;
    if (!message?.usage) continue;
    messages.set(message.id ?? entry.uuid, message.usage);
    model = message.model ?? model;
  }
  const sum = (key) => [...messages.values()].reduce((total, u) => total + (u[key] ?? 0), 0);
  return {
    model: model ?? 'unknown',
    started: first ?? 'unknown',
    seconds: first ? Math.round((Date.parse(last) - Date.parse(first)) / 1000) : 0,
    input: sum('input_tokens'),
    cacheWrite: sum('cache_creation_input_tokens'),
    cacheRead: sum('cache_read_input_tokens'),
    output: sum('output_tokens'),
  };
}

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

// SubagentStop hook (every agent): sums a subagent's real token usage and elapsed time from its transcript into the
// current work order's ledger.md, one row per agent id (a blocked or resumed builder stops more than once), with per-role totals.
// Fails open: logging must never trap an agent.
//   node ledger.mjs cost <id>   → prints the work order's true $, total and per role (costs.mjs reconcile)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECTS, reconcile, usage } from './costs.mjs';
import { section } from './docs.mjs';
import { bare } from './roles.mjs';
import { mainRepo, shredWhere } from './shred.mjs';
import { getWorkOrder, woRoot } from './state.mjs';

const TEXT = ['agent', 'role', 'model', 'started'];
const NUMBERS = ['seconds', 'input', 'cacheWrite', 'cacheRead', 'output'];
const TITLES = ['Seconds', 'Input', 'Cache write', 'Cache read', 'Output'];

// A shred being built or reviewed: its runs belong to its work order.
const inProgress = (shred) => ['work', 'reviewing'].includes(shred.status);

// Work order with a shred in progress, else the latest not yet approved at final; or null.
export function currentWorkOrder(repo) {
  const root = woRoot(repo);
  if (!existsSync(root)) return null;
  const active = shredWhere(repo, inProgress);
  if (active) return active.state.id;
  return readdirSync(root)
    .filter((id) => existsSync(join(root, id, 'state.json')))
    .sort()
    .reverse()
    .find((id) => !getWorkOrder(repo, id).approvals?.final) ?? null;
}

const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());
const row = (values) => `| ${values.join(' | ')} |`;
const header = (titles) => `${row(titles)}\n${row(titles.map(() => '---'))}`;

export function readRuns(md) {
  return section(md, 'Runs').split(/\r?\n/).slice(2)
    .filter((line) => line.startsWith('|'))
    .map((line) => {
      const values = cells(line);
      return Object.fromEntries([...TEXT, ...NUMBERS].map((key, i) => [key, i < TEXT.length ? values[i] : Number(values[i])]));
    });
}

function totals(runs) {
  const groups = Map.groupBy(runs, (run) => run.role);
  const line = (name, group) => row([name, group.length, ...NUMBERS.map((key) => group.reduce((t, run) => t + run[key], 0))]);
  return [...[...groups].map(([role, group]) => line(role, group)), line('**All**', runs)].join('\n');
}

export function render(runs) {
  return `# Ledger\n\n## Totals\n${header(['Role', 'Runs', ...TITLES])}\n${totals(runs)}\n\n`
    + `## Runs\n${header(['Agent', 'Role', 'Model', 'Started', ...TITLES])}\n`
    + runs.map((run) => row([...TEXT, ...NUMBERS].map((key) => run[key]))).join('\n') + '\n';
}

// Records the run; returns the ledger path, or null when there is nothing to log.
export function record(input) {
  if (!input.cwd || !input.agent_id || !input.agent_transcript_path) return null;
  const repo = mainRepo(input.cwd);
  const id = currentWorkOrder(repo);
  if (!id) return null;
  const run = { agent: input.agent_id, role: bare(input.agent_type) ?? 'unknown', ...usage(readFileSync(input.agent_transcript_path, 'utf8')) };
  const file = join(woRoot(repo), id, 'ledger.md');
  const earlier = existsSync(file) ? readRuns(readFileSync(file, 'utf8')).filter((r) => r.agent !== run.agent) : [];
  writeFileSync(file, render([...earlier, run]));
  return file;
}

const dollars = (runs) => Math.round(runs.reduce((total, run) => total + run.cost, 0) * 100) / 100;

// True $ of a work order's ledger runs: { total, roles: { <role>: $ }, reconciled: '<n>/<runs>' }.
export function costReport(repo, id, projects = PROJECTS) {
  const file = join(woRoot(repo), id, 'ledger.md');
  if (!existsSync(file)) throw new Error(`No ledger for work order ${id}.`);
  const runs = reconcile(readRuns(readFileSync(file, 'utf8')), projects);
  const roles = Object.fromEntries([...Map.groupBy(runs, (run) => run.role)].map(([role, group]) => [role, dollars(group)]));
  return { total: dollars(runs), roles, reconciled: `${runs.filter((run) => run.reconciled).length}/${runs.length}` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, id] = process.argv.slice(2);
  if (command === 'cost') {
    try {
      console.log(JSON.stringify(costReport(mainRepo(process.cwd()), id ?? ''), null, 2));
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  } else {
    try {
      record(JSON.parse(readFileSync(0, 'utf8')));
    } catch (error) {
      console.error(`ledger skipped: ${error.message}`);
    }
  }
}

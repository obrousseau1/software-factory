// Solo baseline benchmark (design §15, milestone 8). Run once by hand on a landed shred, before final approval
// (the ledger stops logging after it). Usage:
//   node bench.mjs open <id> <n>    → solo worktree from the shred's base; prints the prompt to spawn spaceport:solo with
//   node bench.mjs round <id> <n>   → commits the solo build, writes diff-solo.patch, prints validator prompts (spawn
//                                     them in parallel)
//   node bench.mjs report <id> <n>  → writes shreds/<n>/bench.md: twins vs solo
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRuns } from './ledger.mjs';
import { lessonsNote } from './lessons.mjs';
import { isTest, profilePath, readProfile } from './profile.mjs';
import { PLUGIN, Role } from './roles.mjs';
import { benchWith, git, mainRepo, mainStatus, planShred, runGates, runSetup, saveShred, shredDir, shredErrors, woBranch } from './shred.mjs';
import { getWorkOrder, woRoot } from './state.mjs';
import { BLOCKING, findingsPath, roundFindings, validatorsFor } from './validate.mjs';

const SOLO = 'solo';
// ponytail: $/MTok as of 2026-10 (claude-api skill); update when prices change. Unknown model → cost `?`.
const PRICES = {
  'claude-opus-5-5': { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  'claude-sonnet-5-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
};
const TOKENS = ['input', 'cacheWrite', 'cacheRead', 'output'];
const tokens = (run, weight = () => 1) => TOKENS.reduce((total, key) => total + run[key] * weight(key), 0);

function benchOf(repo, id, n, ...statuses) {
  const state = getWorkOrder(repo, id);
  const shred = state.shreds?.find((s) => s.n === n);
  if (!shred?.bench) throw new Error(`Shred ${n} has no benchmark: run bench.mjs open ${id} ${n}`);
  if (!statuses.includes(shred.bench.status)) throw new Error(`Benchmark of shred ${n} is ${shred.bench.status}.`);
  return { state, shred, bench: shred.bench };
}

const saveBench = (repo, state, shred, bench) => saveShred(repo, state, { ...shred, bench });

export const activeBench = (repo) => benchWith(repo, 'work');

export function openBench(repo, id, n) {
  const state = getWorkOrder(repo, id);
  const shred = state.shreds?.find((s) => s.n === n);
  if (shred?.status !== 'landed') throw new Error(`Shred ${n} is not landed.`);
  if (!shred.opened || !shred.landedAt) throw new Error(`Shred ${n} has no opened / landedAt time: benchmark a shred landed since M8.`);
  if (shred.bench) throw new Error(`Shred ${n} is already benchmarked.`);

  const worktree = join(dirname(repo), `${basename(repo)}.spaceport`, `${id}-${n}-${SOLO}`);
  const branch = `${woBranch(id)}-${n}-${SOLO}`;
  git(repo, 'worktree', 'add', '-b', branch, worktree, shred.base);
  const setup = runSetup(repo, worktree);
  if (setup.length) throw new Error(`${setup[0]} (worktree kept: ${worktree})`);
  const bench = { status: 'work', worktree, branch, base: shred.base, opened: new Date().toISOString(), blocks: 0, mainStatus: mainStatus(repo) };
  saveBench(repo, state, shred, bench);

  const { reqs } = planShred(repo, id, n);
  const prompt = `Work order: ${id}. Shred ${n}: build ${reqs.join(', ')}. Repo: ${repo}. Worktree: ${worktree}.`
    + lessonsNote(repo, Role.Twin);
  return { agent: `${PLUGIN}:${Role.Solo}`, prompt };
}

// Problems with the solo build; [] = complete. Same bar as the twins' final turn, gates last.
export function checkBench(repo, id, shred) {
  const { bench } = shred;
  const stray = mainStatus(repo).filter((line) => !bench.mainStatus.includes(line));
  const errors = [
    ...(stray.length ? [`changed outside the worktree, undo: ${stray.join(', ')}`] : []),
    ...shredErrors(repo, id, { ...bench, n: shred.n }, readProfile(profilePath(repo))),
  ];
  return errors.length ? errors : runGates(repo, bench.worktree);
}

export function benchRound(repo, id, n) {
  const { state, shred, bench } = benchOf(repo, id, n, 'work');
  const incomplete = checkBench(repo, id, shred);
  git(bench.worktree, 'add', '-A');
  git(bench.worktree, 'commit', '--allow-empty', '-m', `spaceport ${id} shred ${n} ${SOLO}`);
  const dir = shredDir(repo, id, n);
  mkdirSync(join(dir, 'findings'), { recursive: true });
  const diff = join(dir, `diff-${SOLO}.patch`);
  writeFileSync(diff, git(bench.worktree, 'diff', bench.base, 'HEAD'));
  saveBench(repo, state, shred, { ...bench, status: 'validating', incomplete });

  const { ux, roles } = validatorsFor(repo, id, n);
  const validators = roles.map((role) => ({
    agent: `${PLUGIN}:${role}`,
    prompt: `Work order: ${id}. Shred ${n}, solo benchmark (one round, no handoff). Repo: ${repo}. Worktree: ${bench.worktree}. `
      + `Diff: ${diff}. Findings file: ${findingsPath(repo, id, n, SOLO, role)}.`
      + (role === Role.UxValidator ? ` UX level: ${ux === 'deep' ? 'simple' : ux}.` : '') + lessonsNote(repo, role),
  }));
  return { incomplete, validators };
}

// Added test-file lines naming each requirement, from a unified diff.
// ponytail: counts lines, not tests; a stack tagging a test on several lines counts it more than once.
export function testsPerReq(patch, profile, reqs) {
  const counts = Object.fromEntries(reqs.map((req) => [req, 0]));
  let file = null;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('+++ ')) file = line.slice(4).replace(/^b\//, '');
    else if (line.startsWith('+') && file && isTest(profile, file)) reqs.filter((req) => line.includes(req)).forEach((req) => counts[req]++);
  }
  return counts;
}

// $ of one ledger run; NaN when its model has no price.
export function cost(run) {
  const price = PRICES[run.model];
  return price ? tokens(run, (key) => price[key]) / 1e6 : NaN;
}

const sum = (runs, value) => runs.reduce((total, run) => total + value(run), 0);
const blocking = (findings) => findings.filter((f) => BLOCKING.includes(f.severity)).length;

function side(runs, rounds, tests) {
  const all = rounds.flat();
  return {
    runs: runs.length,
    seconds: sum(runs, (run) => run.seconds),
    tokens: sum(runs, tokens),
    cost: sum(runs, cost),
    rounds: rounds.length,
    blockingFirst: blocking(rounds[0]),
    blockingAll: blocking(all),
    minor: all.length - blocking(all),
    tests,
  };
}

const ROWS = [
  ['Agent runs', (s) => s.runs],
  ['Agent seconds', (s) => s.seconds],
  ['Tokens', (s) => s.tokens],
  ['Cost $', (s) => Number.isNaN(s.cost) ? '?' : s.cost.toFixed(2)],
  ['Validation rounds', (s) => s.rounds],
  ['Blocking, round 1', (s) => s.blockingFirst],
  ['Blocking, all rounds', (s) => s.blockingAll],
  ['Minor, all rounds', (s) => s.minor],
];

export function render(n, twins, solo, incomplete) {
  const rows = [...ROWS, ...Object.keys(twins.tests).map((req) => [`Tests ${req}`, (s) => s.tests[req]])]
    .map(([label, value]) => `| ${label} | ${value(twins)} | ${value(solo)} |`);
  const note = incomplete.length ? `\nSolo stopped incomplete: ${incomplete.join('; ')}\n` : '';
  return `# Benchmark: shred ${n}, twins vs solo\n\n| Metric | Twins | Solo |\n|---|---|---|\n${rows.join('\n')}\n${note}`;
}

export function benchReport(repo, id, n) {
  const { state, shred, bench } = benchOf(repo, id, n, 'validating', 'done');
  const solo = roundFindings(repo, id, n, SOLO);
  const twinRounds = Array.from({ length: shred.round }, (_, i) => roundFindings(repo, id, n, `r${i + 1}`));
  const ledger = join(woRoot(repo), id, 'ledger.md');
  const runs = existsSync(ledger) ? readRuns(readFileSync(ledger, 'utf8')) : [];
  const dir = shredDir(repo, id, n);
  const profile = readProfile(profilePath(repo));
  const { reqs } = planShred(repo, id, n);
  const tests = (label) => testsPerReq(readFileSync(join(dir, `diff-${label}.patch`), 'utf8'), profile, reqs);

  // ponytail: runs attributed by start time; anything else spawned during the shred or the bench is counted too.
  const twins = side(runs.filter((r) => r.started >= shred.opened && r.started <= shred.landedAt), twinRounds, tests(`r${shred.round}`));
  const soloSide = side(runs.filter((r) => r.started >= bench.opened), [solo], tests(SOLO));
  const file = join(dir, 'bench.md');
  writeFileSync(file, render(n, twins, soloSide, bench.incomplete ?? []));
  saveBench(repo, state, shred, { ...bench, status: 'done' });
  return { file, twins, solo: soloSide };
}

function main([command, id, n]) {
  const repo = mainRepo(process.cwd());
  const number = Number(n);
  if (!id || !Number.isInteger(number)) throw new Error('Usage: bench.mjs open | round | report <id> <n>');
  if (command === 'open') return openBench(repo, id, number);
  if (command === 'round') return benchRound(repo, id, number);
  if (command === 'report') return benchReport(repo, id, number);
  throw new Error('Usage: bench.mjs open | round | report <id> <n>');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

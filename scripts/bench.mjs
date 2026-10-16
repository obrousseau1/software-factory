// Solo baseline benchmark (design §15, milestone 8). Run once by hand on a validated shred (landed or
// stopped), before final approval (the ledger stops logging after it). The twins' window ends when the shred landed,
// else when the bench opened. Usage:
//   node bench.mjs open <id> <n>       → solo worktree from the shred's base; prints the prompt to spawn spaceport:solo with
//   node bench.mjs round <id> <n>      → commits the build, writes diff-<solo|duo>.patch, prints validator prompts (spawn
//                                        them in parallel)
//   node bench.mjs challenge <id> <n>  → optional, after the solo round: prints the prompt for spaceport:challenger, one
//                                        CHALLENGE + REFACTOR pass on the solo build; then `round` again (solo + challenger)
//   node bench.mjs report <id> <n>     → writes shreds/<n>/bench.md: twins vs solo (vs solo + challenger)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECTS, reconcile, tokens } from './costs.mjs';
import { readRuns } from './ledger.mjs';
import { lessonsNote } from './lessons.mjs';
import { isTest, profilePath, readProfile } from './profile.mjs';
import { PLUGIN, Role } from './roles.mjs';
import { git, mainRepo, mainStatus, planShred, runGates, runSetup, saveShred, shredDir, shredErrors, shredWhere, testLineErrors, woBranch } from './shred.mjs';
import { getWorkOrder, woRoot } from './state.mjs';
import { BLOCKING, findingsPath, roundFindings, validatorsFor } from './validate.mjs';

const SOLO = 'solo';
const DUO = 'duo';
// Build stages: who builds, the label of its diff and findings, the status once its round starts.
const STAGES = {
  work: { role: Role.Solo, label: SOLO, next: 'validating' },
  challenge: { role: Role.Challenger, label: DUO, next: 'duo-validating' },
};

function benchOf(repo, id, n, ...statuses) {
  const state = getWorkOrder(repo, id);
  const shred = state.shreds?.find((s) => s.n === n);
  if (!shred?.bench) throw new Error(`Shred ${n} has no benchmark: run bench.mjs open ${id} ${n}`);
  if (!statuses.includes(shred.bench.status)) throw new Error(`Benchmark of shred ${n} is ${shred.bench.status}.`);
  return { state, shred, bench: shred.bench };
}

const saveBench = (repo, state, shred, bench) => saveShred(repo, state, { ...shred, bench });

// The benchmark being built (solo or challenger), across work orders: { state, shred } or null.
export const activeBench = (repo) => shredWhere(repo, (s) => s.bench?.status in STAGES);

export function openBench(repo, id, n) {
  const state = getWorkOrder(repo, id);
  const shred = state.shreds?.find((s) => s.n === n);
  if (!shred?.opened) throw new Error(`Shred ${n} has no opened time: benchmark a shred opened since M8.`);
  if (!shred.round) throw new Error(`Shred ${n} was never validated: nothing to compare.`);
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

// After the solo round: one fresh agent challenges and refactors the solo build in the same worktree.
export function openChallenge(repo, id, n) {
  const { state, shred, bench } = benchOf(repo, id, n, 'validating');
  roundFindings(repo, id, n, SOLO);
  saveBench(repo, state, shred, { ...bench, status: 'challenge', challenged: new Date().toISOString(), blocks: 0, mainStatus: mainStatus(repo) });
  const { reqs } = planShred(repo, id, n);
  const prompt = `Work order: ${id}. Shred ${n}: challenge and refactor the build of ${reqs.join(', ')}. Repo: ${repo}. `
    + `Worktree: ${bench.worktree}.` + lessonsNote(repo, Role.Twin);
  return { agent: `${PLUGIN}:${Role.Challenger}`, prompt };
}

// Problems with the build in progress; [] = complete. Same bar as the twins' final turn, gates last.
export function checkBench(repo, id, shred) {
  const { bench } = shred;
  const profile = readProfile(profilePath(repo));
  const stray = mainStatus(repo).filter((line) => !bench.mainStatus.includes(line));
  const errors = [
    ...(stray.length ? [`changed outside the worktree, undo: ${stray.join(', ')}`] : []),
    ...testLineErrors(bench, profile),
    ...shredErrors(repo, id, { ...bench, n: shred.n }, profile),
  ];
  return errors.length ? errors : runGates(repo, bench.worktree);
}

export function benchRound(repo, id, n) {
  const { state, shred, bench } = benchOf(repo, id, n, ...Object.keys(STAGES));
  const { label, next } = STAGES[bench.status];
  const incomplete = checkBench(repo, id, shred);
  git(bench.worktree, 'add', '-A');
  git(bench.worktree, 'commit', '--allow-empty', '-m', `spaceport ${id} shred ${n} ${label}`);
  const dir = shredDir(repo, id, n);
  mkdirSync(join(dir, 'findings'), { recursive: true });
  const diff = join(dir, `diff-${label}.patch`);
  writeFileSync(diff, git(bench.worktree, 'diff', bench.base, 'HEAD'));
  saveBench(repo, state, shred, { ...bench, status: next, incomplete: { ...bench.incomplete, [label]: incomplete } });

  const { ux, roles } = validatorsFor(repo, id, n);
  const validators = roles.map((role) => ({
    agent: `${PLUGIN}:${role}`,
    prompt: `Work order: ${id}. Shred ${n}, ${label} benchmark (one round, no handoff). Repo: ${repo}. Worktree: ${bench.worktree}. `
      + `Diff: ${diff}. Findings file: ${findingsPath(repo, id, n, label, role)}.`
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

// Runs of every work order's ledger, once per agent: a run lands in whichever work order was current.
function allRuns(repo) {
  const root = woRoot(repo);
  const runs = readdirSync(root)
    .map((id) => join(root, id, 'ledger.md'))
    .filter((file) => existsSync(file))
    .flatMap((file) => readRuns(readFileSync(file, 'utf8')));
  return [...new Map(runs.map((run) => [run.agent, run])).values()];
}

const sum = (runs, value) => runs.reduce((total, run) => total + value(run), 0);
const blocking = (findings) => findings.filter((f) => BLOCKING.includes(f.severity)).length;

function side(runs, rounds, tests) {
  const all = rounds.flat();
  return {
    runs: runs.length,
    seconds: sum(runs, (run) => run.seconds),
    tokens: sum(runs, tokens),
    cost: sum(runs, (run) => run.cost),
    unreconciled: runs.filter((run) => !run.reconciled).length,
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
  ['Runs not reconciled (snapshot $)', (s) => s.unreconciled],
  ['Validation rounds', (s) => s.rounds],
  ['Blocking, round 1', (s) => s.blockingFirst],
  ['Blocking, all rounds', (s) => s.blockingAll],
  ['Minor, all rounds', (s) => s.minor],
];

// `sides`: [[title, side]], twins first.
export function render(n, sides, incomplete) {
  const reqs = Object.keys(sides[0][1].tests);
  const rows = [...ROWS, ...reqs.map((req) => [`Tests ${req}`, (s) => s.tests[req]])]
    .map(([label, value]) => `| ${[label, ...sides.map(([, s]) => value(s))].join(' | ')} |`);
  const titles = sides.map(([title]) => title);
  const notes = Object.entries(incomplete).filter(([, errors]) => errors.length)
    .map(([label, errors]) => `\n${label} stopped incomplete: ${errors.join('; ')}\n`).join('');
  return `# Benchmark: shred ${n}, ${titles.join(' vs ')}\n\n| Metric | ${titles.join(' | ')} |\n|${'---|'.repeat(titles.length + 1)}\n`
    + `${rows.join('\n')}\n${notes}`;
}

// `projects`: Claude Code transcripts, for the sessions' true costs (costs.mjs).
export function benchReport(repo, id, n, projects = PROJECTS) {
  const { state, shred, bench } = benchOf(repo, id, n, 'validating', 'duo-validating', 'done');
  const twinRounds = Array.from({ length: shred.round }, (_, i) => roundFindings(repo, id, n, `r${i + 1}`));
  const runs = reconcile(allRuns(repo), projects);
  const dir = shredDir(repo, id, n);
  const profile = readProfile(profilePath(repo));
  const { reqs } = planShred(repo, id, n);
  const tests = (label) => testsPerReq(readFileSync(join(dir, `diff-${label}.patch`), 'utf8'), profile, reqs);
  const between = (from, to) => (r) => r.started >= from && (!to || r.started <= to);

  // ponytail: runs attributed by start time; anything else spawned during the shred or the bench is counted too.
  const sides = [
    ['Twins', side(runs.filter(between(shred.opened, shred.landedAt ?? bench.opened)), twinRounds, tests(`r${shred.round}`))],
    ['Solo', side(runs.filter(between(bench.opened, bench.challenged)), [roundFindings(repo, id, n, SOLO)], tests(SOLO))],
  ];
  if (existsSync(join(dir, `diff-${DUO}.patch`))) {
    const build = (r) => r.role === Role.Solo && r.started >= bench.opened;
    sides.push(['Solo + challenger', side(runs.filter((r) => build(r) || between(bench.challenged)(r)), [roundFindings(repo, id, n, DUO)], tests(DUO))]);
  }
  const file = join(dir, 'bench.md');
  const stopped = shred.status === 'landed' ? '' : `\nTwins did not land: shred stopped at ${shred.status}, round ${shred.round}.\n`;
  writeFileSync(file, render(n, sides, bench.incomplete ?? {}) + stopped);
  saveBench(repo, state, shred, { ...bench, status: 'done' });
  return { file, sides: Object.fromEntries(sides) };
}

const USAGE = 'Usage: bench.mjs open | round | challenge | report <id> <n>';

function main([command, id, n]) {
  const repo = mainRepo(process.cwd());
  const number = Number(n);
  if (!id || !Number.isInteger(number)) throw new Error(USAGE);
  if (command === 'open') return openBench(repo, id, number);
  if (command === 'round') return benchRound(repo, id, number);
  if (command === 'challenge') return openChallenge(repo, id, number);
  if (command === 'report') return benchReport(repo, id, number);
  throw new Error(USAGE);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

// Shred worktree + twin rotation (design §4). Run from the main repo or any of its worktrees. Usage:
//   node shred.mjs open <id> <n>    → creates the shred's worktree; refuses when the base gates are red
//   node shred.mjs turn <id> <n>    → checks + commits the previous turn, prints the next turn and its twin prompt
//   node shred.mjs check <id> <n>   → prints { ok, errors } for the turn in progress; exit 1 when not ok
//   node shred.mjs drop <id> <n>    → removes the shred's worktree, branch, handoff and state entry (to redo it)
import { spawnSync, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { section, shreds } from './docs.mjs';
import { frontmatter } from './frontmatter.mjs';
import { lessonsNote } from './lessons.mjs';
import { NONE, gateCommands, isTest, profilePath, readProfile } from './profile.mjs';
import { Role } from './roles.mjs';
import { getWorkOrder, saveState, woRoot } from './state.mjs';

export const Phase = Object.freeze({ Challenge: 'CHALLENGE', Refactor: 'REFACTOR', Build: 'BUILD' });
export const MAX_BLOCKS = 3;
const GATE_TIMEOUT_MS = 10 * 60 * 1000;
const UNFINISHED = /\bTODO\b|NotImplemented/;
const RESOLVED = /^(fixed|rejected|escalated)\b/i;

const HANDOFF_BODY = `
# Handoff

## Done

## Design choices

## Doubts
| ID | Doubt | Status |
|----|-------|--------|
`;

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Main repo root, also from inside a worktree.
export function mainRepo(cwd) {
  return dirname(git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim());
}

export const shredDir = (repo, id, n) => join(woRoot(repo), id, 'shreds', String(n));
export const handoffPath = (repo, id, n) => join(shredDir(repo, id, n), 'handoff.md');
// Validated shreds fast-forward into this branch.
export const woBranch = (id) => `spaceport/${id}`;

// The first shred with `status` across all work orders: { state, shred } or null.
export function shredWith(repo, status) {
  const root = woRoot(repo);
  if (!existsSync(root)) return null;
  for (const id of readdirSync(root)) {
    if (!existsSync(join(root, id, 'state.json'))) continue;
    const state = getWorkOrder(repo, id);
    const shred = state.shreds?.find((s) => s.status === status);
    if (shred) return { state, shred };
  }
  return null;
}

// The one shred in `work`: twins write only there.
export const activeShred = (repo) => shredWith(repo, 'work');

// Trimmed non-blank lines of `before` missing from `after` (multiset): re-indenting is not removing.
export function removedLines(before, after) {
  const left = new Map();
  for (const line of lines(after)) left.set(line, (left.get(line) ?? 0) + 1);
  return lines(before).filter((line) => {
    const count = left.get(line) ?? 0;
    left.set(line, count - 1);
    return count <= 0;
  });
}

const lines = (text) => (text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

// Test lines removed from `path`, minus those a validator licensed for removal in the fix turn.
export function testRemovals(shred, path, before, after) {
  return removedLines(removedLines(before, after).join('\n'), (shred.licenses?.[path] ?? []).join('\n'));
}

export function showAt(worktree, ref, rel) {
  try {
    return git(worktree, 'show', `${ref}:${rel}`);
  } catch {
    return null;
  }
}

// Files changed in the worktree since `ref`, untracked included: [{ path, before, after }] (null = absent).
export function changes(worktree, ref) {
  const tracked = git(worktree, 'diff', '--name-only', '--no-renames', ref).split('\n');
  const untracked = git(worktree, 'ls-files', '--others', '--exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked].filter(Boolean))].map((path) => {
    const file = join(worktree, path);
    return { path, before: showAt(worktree, ref, path), after: existsSync(file) ? readFileSync(file, 'utf8') : null };
  });
}

// ponytail: shell is cmd.exe on Windows (no bash: `bash` there may be the WSL launcher); profile commands
// using bash-only syntax fail. Point at Git Bash if a repo needs it.
// The command's first error line, or null when it passes.
function failure(command, cwd) {
  const run = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: GATE_TIMEOUT_MS });
  if (run.status === 0) return null;
  const output = lines(`${run.stdout ?? ''}\n${run.stderr ?? ''}`);
  const evidence = output.find((line) => /error|fail/i.test(line)) ?? output.at(-1) ?? run.error?.message ?? `exit ${run.status}`;
  return evidence.slice(0, 200);
}

export function runGates(repo, cwd) {
  return Object.entries(gateCommands(readProfile(profilePath(repo))))
    .map(([gate, command]) => [gate, failure(command, cwd)])
    .filter(([, evidence]) => evidence !== null)
    .map(([gate, evidence]) => `gate ${gate} red: ${evidence}`);
}

// Installs the dependencies a fresh worktree lacks (profile `setup`); [] when it passes or is none.
export function runSetup(repo, cwd) {
  const { setup } = readProfile(profilePath(repo));
  const evidence = setup === NONE ? null : failure(setup, cwd);
  return evidence === null ? [] : [`setup failed: ${evidence}`];
}

const mainStatus = (repo) => git(repo, 'status', '--porcelain', '-uall')
  .split('\n')
  .filter((line) => line && !line.slice(3).startsWith('.liftoff/'));

function planShred(repo, id, n) {
  const plan = readFileSync(join(woRoot(repo), id, 'plan.md'), 'utf8');
  const shred = shreds(plan).find((s) => s.n === n);
  if (!shred) throw new Error(`plan.md has no shred ${n}`);
  return shred;
}

const findShred = (state, n) => {
  const shred = state.shreds?.find((s) => s.n === n);
  if (!shred) throw new Error(`Shred ${n} is not open: run shred.mjs open ${state.id} ${n}`);
  return shred;
};

export function saveShred(repo, state, shred) {
  return saveState(repo, { ...state, shreds: state.shreds.map((s) => s.n === shred.n ? shred : s) });
}

export function openShred(repo, id, n) {
  const state = getWorkOrder(repo, id);
  if (state.step !== 'work') throw new Error(`Work order ${id} is at ${state.step}, not work.`);
  if (state.shreds?.some((s) => s.n === n)) throw new Error(`Shred ${n} is already open.`);
  const busy = state.shreds?.find((s) => s.status !== 'landed');
  if (busy) throw new Error(`Shred ${busy.n} is ${busy.status}; one shred at a time.`);
  const active = activeShred(repo);
  if (active) throw new Error(`Shred ${active.shred.n} of ${active.state.id} is in work; one shred at a time.`);
  planShred(repo, id, n);

  const worktree = join(dirname(repo), `${basename(repo)}.spaceport`, `${id}-${n}`);
  const branch = `${woBranch(id)}-${n}`;
  if (!git(repo, 'branch', '--list', woBranch(id)).trim()) git(repo, 'branch', woBranch(id), 'HEAD');
  git(repo, 'worktree', 'add', '-b', branch, worktree, woBranch(id));
  const setup = runSetup(repo, worktree);
  const red = setup.length ? setup : runGates(repo, worktree);
  if (red.length) {
    git(repo, 'worktree', 'remove', '--force', worktree);
    git(repo, 'branch', '-D', branch);
    throw new Error(`Base is red, fix the repo first: ${red.join('; ')}`);
  }
  const shred = { n, status: 'work', worktree, branch, base: git(worktree, 'rev-parse', 'HEAD').trim(), turn: -1 };
  saveState(repo, { ...state, shreds: [...(state.shreds ?? []), shred] });
  return shred;
}

// Turn k of a shred covering reqs: design §4 rotation.
export function turnPlan(reqs, k) {
  const twin = k % 2 ? 'B' : 'A';
  if (k === 0) return { twin, phases: [Phase.Build], challenge: null, build: reqs[0], final: false };
  const final = k === reqs.length;
  return {
    twin,
    phases: final ? [Phase.Challenge, Phase.Refactor] : [Phase.Challenge, Phase.Refactor, Phase.Build],
    challenge: reqs[k - 1],
    build: final ? null : reqs[k],
    final,
  };
}

// Fix turn after validation round `round` failed: the other twin resolves the findings (F doubts), then the
// shred is validated again.
export function fixPlan(k, round) {
  return { twin: k % 2 ? 'B' : 'A', phases: [Phase.Challenge], challenge: `findings r${round}`, build: null, final: true };
}

function doubtRows(md) {
  return section(md, 'Doubts')
    .split(/\r?\n/)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter(([doubtId]) => /^(D-\d+|F\d+-\d+)$/.test(doubtId ?? ''))
    .map(([doubtId, , status = '']) => ({ id: doubtId, status }));
}

// Problems with the turn in progress; [] = complete. Gates run last, only when everything else passes.
export function checkTurn(repo, id, n) {
  const shred = findShred(getWorkOrder(repo, id), n);
  if (shred.status !== 'work') return [`Shred ${n} is ${shred.status}: no turn to check.`];
  if (shred.turn < 0) return ['No turn started: run shred.mjs turn.'];
  const profile = readProfile(profilePath(repo));
  const stray = mainStatus(repo).filter((line) => !shred.mainStatus.includes(line));
  const errors = [
    ...handoffErrors(repo, id, shred),
    ...testLineErrors(shred, profile),
    ...(stray.length ? [`changed outside the worktree, undo: ${stray.join(', ')}`] : []),
    ...(shred.final ? shredErrors(repo, id, shred, profile) : []),
  ];
  return errors.length ? errors : runGates(repo, shred.worktree);
}

// handoff.md at this turn, at its last phase, every open doubt received resolved.
function handoffErrors(repo, id, shred) {
  const file = handoffPath(repo, id, shred.n);
  const md = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const meta = frontmatter(md);
  const last = shred.phases.at(-1);
  const errors = [];
  if (Number(meta.turn) !== shred.turn) errors.push(`handoff.md: turn must be ${shred.turn}`);
  if (meta.phase !== last) errors.push(`handoff.md: finish every phase; phase must end at ${last}`);

  const incoming = join(shredDir(repo, id, shred.n), 'turns', `${shred.turn - 1}.md`);
  if (!existsSync(incoming)) return errors;
  const now = new Map(doubtRows(md).map((row) => [row.id, row.status]));
  const open = doubtRows(readFileSync(incoming, 'utf8')).filter((row) => /^open/i.test(row.status));
  for (const doubt of open.filter((row) => !RESOLVED.test(now.get(row.id) ?? ''))) {
    errors.push(`handoff.md: doubt ${doubt.id} needs fixed / rejected: <why> / escalated: <why>`);
  }
  return errors;
}

// Test lines committed by earlier turns that this turn removed.
function testLineErrors(shred, profile) {
  return changes(shred.worktree, 'HEAD')
    .filter(({ path, before }) => before !== null && isTest(profile, path))
    .map(({ path, before, after }) => [path, testRemovals(shred, path, before, after)])
    .filter(([, removed]) => removed.length)
    .map(([path, removed]) => `${path}: removed test lines from earlier turns, restore them: "${removed[0]}"`);
}

// Shred complete: nothing unfinished in its diff, every requirement referenced by a changed test.
function shredErrors(repo, id, shred, profile) {
  const changed = changes(shred.worktree, shred.base);
  const errors = changed
    .filter(({ before, after }) => removedLines(after, before).some((line) => UNFINISHED.test(line)))
    .map(({ path }) => `${path}: TODO / NotImplemented left in the diff`);
  const tests = changed.filter(({ path, after }) => after !== null && isTest(profile, path));
  for (const req of planShred(repo, id, shred.n).reqs) {
    if (!tests.some(({ after }) => after.includes(req))) errors.push(`${req}: no changed test references it`);
  }
  return errors;
}

function writeHandoff(file, fields) {
  const header = ['---', ...Object.entries(fields).map(([key, value]) => `${key}: ${value ?? 'none'}`), '---'].join('\n');
  const body = existsSync(file) ? readFileSync(file, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : HANDOFF_BODY;
  writeFileSync(file, `${header}\n${body.replace(/^\n?/, '\n')}`);
}

export function nextTurn(repo, id, n) {
  const state = getWorkOrder(repo, id);
  const shred = findShred(state, n);
  if (shred.status !== 'work') throw new Error(`Shred ${n} is ${shred.status}.`);
  if (shred.turn >= 0 && !shred.fix) {
    const errors = checkTurn(repo, id, n);
    if (errors.length) throw new Error(`Turn ${shred.turn} is not complete: ${errors.join('; ')}`);
    git(shred.worktree, 'add', '-A');
    git(shred.worktree, 'commit', '--allow-empty', '-m', `spaceport ${id} shred ${n} turn ${shred.turn}`);
    if (shred.final) {
      saveShred(repo, state, { ...shred, status: 'built', licenses: undefined });
      return { done: true };
    }
  }

  const k = shred.turn + 1;
  const dir = shredDir(repo, id, n);
  const handoff = handoffPath(repo, id, n);
  mkdirSync(join(dir, 'turns'), { recursive: true });
  if (existsSync(handoff)) copyFileSync(handoff, join(dir, 'turns', `${k - 1}.md`));
  const plan = shred.fix ? fixPlan(k, shred.fix) : turnPlan(planShred(repo, id, n).reqs, k);
  writeHandoff(handoff, { turn: k, twin: plan.twin, phase: plan.phases[0], challenge: plan.challenge, build: plan.build });
  saveShred(repo, state, { ...shred, ...plan, fix: undefined, turn: k, blocks: 0, mainStatus: mainStatus(repo) });

  const steps = plan.phases.map((phase) => `${phase} ${phase === Phase.Build ? plan.build : plan.challenge}`).join(' → ');
  const prompt = `Work order: ${id}. Shred ${n}, turn ${k}, twin ${plan.twin}. Phases: ${steps}. `
    + `Worktree: ${shred.worktree}. Handoff: ${handoff}.${plan.final ? ' Final turn: the shred is complete when you stop.' : ''}`
    + lessonsNote(repo, Role.Twin);
  return { turn: k, ...plan, prompt, done: false };
}

// Removes the shred's worktree, branch, folder and state entry, so it can be opened again (spec amended).
export function dropShred(repo, id, n) {
  const state = getWorkOrder(repo, id);
  const shred = findShred(state, n);
  if (existsSync(shred.worktree)) git(repo, 'worktree', 'remove', '--force', shred.worktree);
  if (git(repo, 'branch', '--list', shred.branch).trim()) git(repo, 'branch', '-D', shred.branch);
  rmSync(shredDir(repo, id, n), { recursive: true, force: true });
  saveState(repo, { ...state, shreds: state.shreds.filter((s) => s.n !== n) });
  return { dropped: n };
}

function main([command, id, n]) {
  const repo = mainRepo(process.cwd());
  const number = Number(n);
  const usage = 'Usage: shred.mjs open | turn | check | drop <id> <n>';
  if (!id || !Number.isInteger(number)) throw new Error(usage);
  if (command === 'open') return openShred(repo, id, number);
  if (command === 'turn') return nextTurn(repo, id, number);
  if (command === 'drop') return dropShred(repo, id, number);
  if (command !== 'check') throw new Error(usage);
  const errors = checkTurn(repo, id, number);
  if (errors.length) process.exitCode = 1;
  return { ok: !errors.length, errors };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

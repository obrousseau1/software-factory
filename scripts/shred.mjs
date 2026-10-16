// Shred worktree + builder (design §4). Run from the main repo or any of its worktrees. Usage:
//   node shred.mjs open <id> <n>    → creates the shred's worktree (refuses a red base), prints the builder agent + prompt
//   node shred.mjs check <id> <n>   → prints { ok, errors } for the build in progress; exit 1 when not ok
//   node shred.mjs built <id> <n>   → checks and commits the build, marks the shred built; refuses an incomplete build
//   node shred.mjs drop <id> <n>    → removes the shred's worktree, branch, folder and state entry (to redo it)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { shreds } from './docs.mjs';
import { runGates, runSetup } from './gates.mjs';
import { lessonsNote } from './lessons.mjs';
import { isTest, profilePath, readProfile } from './profile.mjs';
import { PLUGIN, Role } from './roles.mjs';
import { getWorkOrder, saveState, woRoot } from './state.mjs';

export const MAX_BLOCKS = 3;
const UNFINISHED = /\bTODO\b|NotImplemented/;

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Main repo root, also from inside a worktree.
export function mainRepo(cwd) {
  return dirname(git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim());
}

export const shredDir = (repo, id, n) => join(woRoot(repo), id, 'shreds', String(n));
// Validated shreds fast-forward into this branch.
export const woBranch = (id) => `spaceport/${id}`;

// The first shred matching across all work orders: { state, shred } or null.
export function shredWhere(repo, match) {
  const root = woRoot(repo);
  if (!existsSync(root)) return null;
  for (const id of readdirSync(root)) {
    if (!existsSync(join(root, id, 'state.json'))) continue;
    const state = getWorkOrder(repo, id);
    const shred = state.shreds?.find(match);
    if (shred) return { state, shred };
  }
  return null;
}

export const shredWith = (repo, status) => shredWhere(repo, (s) => s.status === status);
// The one shred in `work`: the builder writes only there.
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

// Test lines removed from `path`, minus those a reviewer licensed for removal in the fix round.
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

export const mainStatus = (repo) => git(repo, 'status', '--porcelain', '-uall')
  .split('\n')
  .filter((line) => line && !line.slice(3).startsWith('.liftoff/'));

export function planShred(repo, id, n) {
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
  const base = git(worktree, 'rev-parse', 'HEAD').trim();
  const shred = { n, status: 'work', worktree, branch, base, blocks: 0, opened: new Date().toISOString(), mainStatus: mainStatus(repo) };
  saveState(repo, { ...state, shreds: [...(state.shreds ?? []), shred] });
  return { n, worktree, agent: `${PLUGIN}:${Role.Builder}`, prompt: builderPrompt(repo, id, n, worktree) };
}

const builderPrompt = (repo, id, n, worktree) =>
  `Work order: ${id}. Shred ${n}: build ${planShred(repo, id, n).reqs.join(', ')}. Repo: ${repo}. Worktree: ${worktree}.`
  + lessonsNote(repo, Role.Builder);

// Problems with the build in progress; [] = complete. Gates run last, only when everything else passes.
export function checkBuild(repo, id, n) {
  const shred = findShred(getWorkOrder(repo, id), n);
  if (shred.status !== 'work') return [`Shred ${n} is ${shred.status}: no build to check.`];
  const profile = readProfile(profilePath(repo));
  const stray = mainStatus(repo).filter((line) => !shred.mainStatus.includes(line));
  const errors = [
    ...testLineErrors(shred, profile),
    ...(stray.length ? [`changed outside the worktree, undo: ${stray.join(', ')}`] : []),
    ...shredErrors(repo, id, shred, profile),
  ];
  return errors.length ? errors : runGates(repo, shred.worktree);
}

// Committed test lines (the base, or an earlier round) the build removed.
export function testLineErrors(shred, profile) {
  return changes(shred.worktree, 'HEAD')
    .filter(({ path, before }) => before !== null && isTest(profile, path))
    .map(({ path, before, after }) => [path, testRemovals(shred, path, before, after)])
    .filter(([, removed]) => removed.length)
    .map(([path, removed]) => `${path}: removed committed test lines, restore them: "${removed[0]}"`);
}

// Shred complete: nothing unfinished in its diff, every requirement referenced by a changed test.
export function shredErrors(repo, id, shred, profile) {
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

// Commits a complete build and marks the shred built (ready for review).
export function markBuilt(repo, id, n) {
  const errors = checkBuild(repo, id, n);
  if (errors.length) throw new Error(`Shred ${n} is not complete: ${errors.join('; ')}`);
  const state = getWorkOrder(repo, id);
  const shred = findShred(state, n);
  const buildNumber = (shred.round ?? 0) + 1;
  git(shred.worktree, 'add', '-A');
  git(shred.worktree, 'commit', '--allow-empty', '-m', `spaceport ${id} shred ${n} build ${buildNumber}`);
  saveShred(repo, state, { ...shred, status: 'built', licenses: undefined });
  return { built: n };
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
  const usage = 'Usage: shred.mjs open | check | built | drop <id> <n>';
  if (!id || !Number.isInteger(number)) throw new Error(usage);
  if (command === 'open') return openShred(repo, id, number);
  if (command === 'built') return markBuilt(repo, id, number);
  if (command === 'drop') return dropShred(repo, id, number);
  if (command !== 'check') throw new Error(usage);
  const errors = checkBuild(repo, id, number);
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

// Review rounds of a built shred (design §5). Usage:
//   node review.mjs round <id> <n>    → starts the next round (max MAX_ROUNDS), writes the diff, prints reviewer prompts
//   node review.mjs verdict <id> <n>  → reads the round's findings: pass → the shred lands on spaceport/<id>;
//                                       Critical / Major → back to work, with the fix message for the builder;
//                                       last round → escalated
//   node review.mjs summary <id>      → shreds, rounds and Minor findings, for the final step
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { section, shreds } from './docs.mjs';
import { lessonsNote } from './lessons.mjs';
import { isSensitive, profilePath, readProfile } from './profile.mjs';
import { PLUGIN, Role } from './roles.mjs';
import { git, mainRepo, saveShred, shredDir, woBranch } from './shred.mjs';
import { getWorkOrder, woRoot } from './state.mjs';

export const MAX_ROUNDS = 2;
export const SEVERITIES = ['Critical', 'Major', 'Minor'];
export const BLOCKING = ['Critical', 'Major'];
const HEADER = /^\|\s*#\s*\|\s*Severity\s*\|\s*Where\s*\|\s*Finding\s*\|/m;

// `label`: `r<k>` for round k.
export const findingsPath = (repo, id, n, label, role) => join(shredDir(repo, id, n), 'findings', `${label}-${role}.md`);

function shredOf(state, n, status) {
  const shred = state.shreds?.find((s) => s.n === n);
  if (!shred) throw new Error(`Shred ${n} is not open.`);
  if (shred.status !== status) throw new Error(`Shred ${n} is ${shred.status}, not ${status}.`);
  return shred;
}

// The plan's UX level for the shred.
const uxOf = (repo, id, n) => shreds(readFileSync(join(woRoot(repo), id, 'plan.md'), 'utf8')).find((s) => s.n === n)?.ux ?? 'none';

// Reviewers of a shred: the reviewer always; the security reviewer when the diff touches a sensitive path.
export function reviewersFor(repo, shred) {
  const profile = readProfile(profilePath(repo));
  const changed = git(shred.worktree, 'diff', '--name-only', shred.base, 'HEAD').split('\n').filter(Boolean);
  return changed.some((path) => isSensitive(profile, path)) ? [Role.Reviewer, Role.SecurityReviewer] : [Role.Reviewer];
}

export function startRound(repo, id, n) {
  const state = getWorkOrder(repo, id);
  const shred = shredOf(state, n, 'built');
  const round = (shred.round ?? 0) + 1;
  if (round > MAX_ROUNDS) throw new Error(`Shred ${n} had ${MAX_ROUNDS} rounds; escalate.`);

  const dir = shredDir(repo, id, n);
  mkdirSync(join(dir, 'findings'), { recursive: true });
  const diff = join(dir, `diff-r${round}.patch`);
  writeFileSync(diff, git(shred.worktree, 'diff', shred.base, 'HEAD'));
  const reviewers = reviewersFor(repo, shred);
  saveShred(repo, state, { ...shred, status: 'reviewing', round, reviewers, licenses: undefined });

  const ux = uxOf(repo, id, n);
  // ponytail: UX deep (Playwright + screenshots) deferred; runs as simple.
  const level = ux === 'deep' ? 'simple' : ux;
  const earlier = round > 1 ? ` Earlier findings: ${join(dir, 'findings')} (rounds 1-${round - 1}).` : '';
  const prompts = reviewers.map((role) => ({
    agent: `${PLUGIN}:${role}`,
    prompt: `Work order: ${id}. Shred ${n}, round ${round}. Repo: ${repo}. Worktree: ${shred.worktree}. Diff: ${diff}. `
      + `Findings file: ${findingsPath(repo, id, n, `r${round}`, role)}.`
      + (role === Role.Reviewer ? ` UX level: ${level}.` : '') + earlier + lessonsNote(repo, role),
  }));
  return { round, reviewers: prompts, warnings: ux === 'deep' ? ['UX deep runs as simple (Playwright not built yet).'] : [] };
}

// `## Remove` blocks: `### <#> <path>` + a fenced block of the exact test lines finding <#> asks to delete.
// Throws when a block is malformed (e.g. unclosed fence): it would otherwise license nothing, silently.
export function parseRemovals(md, file) {
  const remove = section(md, 'Remove');
  const blocks = [...remove.matchAll(/^### (\d+) (\S+)\s*\r?\n```[^\n]*\r?\n([\s\S]*?)^```/gm)];
  const headings = remove.match(/^### /gm)?.length ?? 0;
  if (blocks.length !== headings) throw new Error(`${file}: ## Remove has ${headings} blocks, ${blocks.length} well-formed (### <#> <path> + a closed fence)`);
  return blocks.map(([, number, path, text]) => ({ number, path, lines: text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) }));
}

// Rows of a findings file: [{ severity, where, finding, remove }]. Throws when the file is missing or malformed.
export function parseFindings(file) {
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  const md = readFileSync(file, 'utf8');
  if (!HEADER.test(md)) throw new Error(`${file}: no | # | Severity | Where | Finding | table`);
  const removals = parseRemovals(md, file);
  return md.split(/\r?\n/)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter(([number]) => /^\d+$/.test(number ?? ''))
    .map(([number, severity, where, finding]) => {
      if (!SEVERITIES.includes(severity)) throw new Error(`${file}: severity must be ${SEVERITIES.join('|')}, not "${severity}"`);
      return { severity, where, finding, remove: removals.filter((r) => r.number === number) };
    });
}

// Test lines the blocking findings license the fix round to delete: { <path>: [lines] }.
function licenses(blocking) {
  const byPath = {};
  for (const { path, lines } of blocking.flatMap((f) => f.remove)) byPath[path] = [...(byPath[path] ?? []), ...lines];
  return byPath;
}

// The message liftoff sends the builder: each blocking finding, numbered F<round>-<i>, to fix or reject.
export function fixMessage(round, blocking) {
  const licensed = (f) => f.remove.length ? ' (removal licensed)' : '';
  const rows = blocking.map((f, i) => `F${round}-${i + 1} [${f.severity}] ${f.role}: ${f.where}: ${f.finding}${licensed(f)}`);
  return [`Review round ${round} found blocking issues. Fix or reject each, run the gates, then report:`, ...rows].join('\n');
}

// Every reviewer's findings of the round, tagged with its role; throws naming each missing / malformed file.
export function roundFindings(repo, id, shred) {
  const errors = [];
  const findings = shred.reviewers.flatMap((role) => {
    try {
      return parseFindings(findingsPath(repo, id, shred.n, `r${shred.round}`, role)).map((f) => ({ ...f, role }));
    } catch (error) {
      errors.push(error.message);
      return [];
    }
  });
  if (errors.length) throw new Error(`Re-spawn these reviewers: ${errors.join('; ')}`);
  return findings;
}

// Fast-forwards the work-order branch to the shred (refuses otherwise), then removes the worktree and its branch.
function land(repo, id, shred) {
  git(repo, 'fetch', '-q', '.', `${shred.branch}:${woBranch(id)}`);
  git(repo, 'worktree', 'remove', '--force', shred.worktree);
  git(repo, 'branch', '-D', shred.branch);
}

export function verdict(repo, id, n) {
  const state = getWorkOrder(repo, id);
  const shred = shredOf(state, n, 'reviewing');
  const { round } = shred;
  const findings = roundFindings(repo, id, shred);
  const minor = [...(shred.minor ?? []), ...findings.filter((f) => f.severity === 'Minor').map(({ remove, ...f }) => ({ round, ...f }))];
  const blocking = findings.filter((f) => BLOCKING.includes(f.severity));
  if (!blocking.length) {
    land(repo, id, shred);
    saveShred(repo, state, { ...shred, status: 'landed', minor, landedAt: new Date().toISOString() });
    return { pass: true, round, landed: woBranch(id), minor: minor.length };
  }
  if (round >= MAX_ROUNDS) {
    saveShred(repo, state, { ...shred, status: 'escalated', minor });
    return { pass: false, round, escalated: true, blocking };
  }
  saveShred(repo, state, { ...shred, status: 'work', blocks: 0, minor, licenses: licenses(blocking) });
  return { pass: false, round, escalated: false, blocking: blocking.length, fix: fixMessage(round, blocking) };
}

export function summary(repo, id) {
  const state = getWorkOrder(repo, id);
  return {
    branch: woBranch(id),
    shreds: (state.shreds ?? []).map(({ n, status, round, minor = [] }) => ({ n, status, rounds: round ?? 0, minor })),
  };
}

const USAGE = 'Usage: review.mjs round | verdict <id> <n> | summary <id>';

function main([command, id, n]) {
  const repo = mainRepo(process.cwd());
  if (command === 'summary' && id) return summary(repo, id);
  const number = Number(n);
  if (!id || !Number.isInteger(number)) throw new Error(USAGE);
  if (command === 'round') return startRound(repo, id, number);
  if (command === 'verdict') return verdict(repo, id, number);
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

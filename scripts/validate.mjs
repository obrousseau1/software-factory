// Validation rounds of a built shred (design §5). Usage:
//   node validate.mjs round <id> <n>    → starts the next round (max MAX_ROUNDS), writes the diff, prints validator prompts
//   node validate.mjs verdict <id> <n>  → reads the round's findings: pass → the shred lands on spaceport/<id>;
//                                         Critical / Major → F doubts in handoff.md and a fix turn; round 3 → escalated
//   node validate.mjs summary <id>      → shreds, rounds and Minor findings, for the final step
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { section, shreds } from './docs.mjs';
import { lessonsNote } from './lessons.mjs';
import { PLUGIN, Role, VALIDATORS } from './roles.mjs';
import { git, handoffPath, mainRepo, saveShred, shredDir, woBranch } from './shred.mjs';
import { getWorkOrder, woRoot } from './state.mjs';

export const MAX_ROUNDS = 3;
export const SEVERITIES = ['Critical', 'Major', 'Minor'];
export const BLOCKING = ['Critical', 'Major'];
const HEADER = /^\|\s*#\s*\|\s*Severity\s*\|\s*Where\s*\|\s*Finding\s*\|/m;

// `label`: `r<k>` for round k, `solo` for the benchmark (bench.mjs).
export const findingsPath = (repo, id, n, label, role) => join(shredDir(repo, id, n), 'findings', `${label}-${role}.md`);

function shredOf(state, n, status) {
  const shred = state.shreds?.find((s) => s.n === n);
  if (!shred) throw new Error(`Shred ${n} is not open.`);
  if (shred.status !== status) throw new Error(`Shred ${n} is ${shred.status}, not ${status}.`);
  return shred;
}

// Validators for a shred: ux only when the plan gives it a UX level.
export function validatorsFor(repo, id, n) {
  const ux = shreds(readFileSync(join(woRoot(repo), id, 'plan.md'), 'utf8')).find((s) => s.n === n)?.ux ?? 'none';
  return { ux, roles: ux === 'none' ? VALIDATORS.filter((role) => role !== Role.UxValidator) : VALIDATORS };
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
  saveShred(repo, state, { ...shred, status: 'validating', round, licenses: undefined });

  const { ux, roles } = validatorsFor(repo, id, n);
  // ponytail: UX deep (Playwright + screenshots) deferred; runs as simple.
  const level = ux === 'deep' ? 'simple' : ux;
  const earlier = round > 1 ? ` Earlier findings: ${join(dir, 'findings')} (rounds 1-${round - 1}).` : '';
  const validators = roles.map((role) => ({
    agent: `${PLUGIN}:${role}`,
    prompt: `Work order: ${id}. Shred ${n}, round ${round}. Repo: ${repo}. Worktree: ${shred.worktree}. Diff: ${diff}. `
      + `Handoff: ${handoffPath(repo, id, n)}. Findings file: ${findingsPath(repo, id, n, `r${round}`, role)}.`
      + (role === Role.UxValidator ? ` UX level: ${level}.` : '') + earlier + lessonsNote(repo, role),
  }));
  return { round, validators, warnings: ux === 'deep' ? ['UX deep runs as simple (Playwright not built yet).'] : [] };
}

// `## Remove` blocks: `### <#> <path>` + a fenced block of the exact test lines finding <#> asks to delete.
export function parseRemovals(md) {
  const blocks = section(md, 'Remove').matchAll(/^### (\d+) (\S+)\s*\r?\n```[^\n]*\r?\n([\s\S]*?)^```/gm);
  return [...blocks].map(([, number, path, text]) => ({ number, path, lines: text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) }));
}

// Rows of a findings file: [{ severity, where, finding, remove }]. Throws when the file is missing or malformed.
export function parseFindings(file) {
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  const md = readFileSync(file, 'utf8');
  if (!HEADER.test(md)) throw new Error(`${file}: no | # | Severity | Where | Finding | table`);
  const removals = parseRemovals(md);
  return md.split(/\r?\n/)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter(([number]) => /^\d+$/.test(number ?? ''))
    .map(([number, severity, where, finding]) => {
      if (!SEVERITIES.includes(severity)) throw new Error(`${file}: severity must be ${SEVERITIES.join('|')}, not "${severity}"`);
      return { severity, where, finding, remove: removals.filter((r) => r.number === number) };
    });
}

// Test lines the blocking findings license the fix turn to delete: { <path>: [lines] }.
function licenses(blocking) {
  const byPath = {};
  for (const { path, lines } of blocking.flatMap((f) => f.remove)) byPath[path] = [...(byPath[path] ?? []), ...lines];
  return byPath;
}

// Blocking findings become open F doubts the fix turn must resolve.
function addDoubts(file, round, blocking) {
  const licensed = (f) => f.remove.length ? ' (removal licensed)' : '';
  const rows = blocking.map((f, i) => `| F${round}-${i + 1} | [${f.severity}] ${f.role}: ${f.where}: ${f.finding.replaceAll('|', '/')}${licensed(f)} | open |`);
  writeFileSync(file, `${readFileSync(file, 'utf8').trimEnd()}\n${rows.join('\n')}\n`);
}

// Every validator's findings of the round, tagged with its role; throws naming each missing / malformed file.
export function roundFindings(repo, id, n, label) {
  const errors = [];
  const findings = validatorsFor(repo, id, n).roles.flatMap((role) => {
    try {
      return parseFindings(findingsPath(repo, id, n, label, role)).map((f) => ({ ...f, role }));
    } catch (error) {
      errors.push(error.message);
      return [];
    }
  });
  if (errors.length) throw new Error(`Re-spawn these validators: ${errors.join('; ')}`);
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
  const shred = shredOf(state, n, 'validating');
  const { round } = shred;
  const findings = roundFindings(repo, id, n, `r${round}`);
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
  addDoubts(handoffPath(repo, id, n), round, blocking);
  saveShred(repo, state, { ...shred, status: 'work', fix: round, minor, licenses: licenses(blocking) });
  return { pass: false, round, escalated: false, blocking: blocking.length };
}

export function summary(repo, id) {
  const state = getWorkOrder(repo, id);
  return {
    branch: woBranch(id),
    shreds: (state.shreds ?? []).map(({ n, status, round, minor = [] }) => ({ n, status, rounds: round ?? 0, minor })),
  };
}

const USAGE = 'Usage: validate.mjs round | verdict <id> <n> | summary <id>';

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

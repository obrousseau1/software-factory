// Runs the profile's gate and setup commands in a worktree, skipping gates already green for the same content.
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NONE, gateCommands, profilePath, readProfile } from './profile.mjs';

// All gates of one run share this budget: under the SubagentStop hook's 30-min timeout, which would fail it open.
export const GATES_BUDGET_MS = 25 * 60 * 1000;
const SETUP_TIMEOUT_MS = 10 * 60 * 1000;
const GREEN_KEPT = 20;

// Gates of a tree and command set already green are not run again. Only green is cached: a red gate may be flaky.
// ponytail: the key ignores installed dependencies (gitignored); add the lockfile hash if a stale node_modules hides red.
export function runGates(repo, cwd, budgetMs = GATES_BUDGET_MS) {
  const commands = gateCommands(readProfile(profilePath(repo)));
  const key = createHash('sha256').update(`${treeHash(cwd)}\n${JSON.stringify(commands)}`).digest('hex');
  const green = greenKeys(repo);
  if (green.includes(key)) return [];
  const deadline = Date.now() + budgetMs;
  const errors = Object.entries(commands)
    .map(([gate, command]) => {
      const left = deadline - Date.now();
      return [gate, left > 0 ? failure(command, cwd, left) : 'not run: gate time budget spent'];
    })
    .filter(([, evidence]) => evidence !== null)
    .map(([gate, evidence]) => `gate ${gate} red: ${evidence}`);
  if (!errors.length) writeFileSync(greenFile(repo), JSON.stringify([...green, key].slice(-GREEN_KEPT)));
  return errors;
}

// Installs the dependencies a fresh worktree lacks (profile `setup`); [] when it passes or is none.
export function runSetup(repo, cwd) {
  const { setup } = readProfile(profilePath(repo));
  const evidence = setup === NONE ? null : failure(setup, cwd, SETUP_TIMEOUT_MS);
  return evidence === null ? [] : [`setup failed: ${evidence}`];
}

const greenFile = (repo) => join(repo, '.liftoff', 'gates-green.json');
const greenKeys = (repo) => existsSync(greenFile(repo)) ? JSON.parse(readFileSync(greenFile(repo), 'utf8')) : [];

// Content hash of the worktree as it is, untracked files included, without touching its index.
export function treeHash(cwd) {
  const index = join(tmpdir(), `spaceport-index-${process.pid}-${Date.now()}`);
  const real = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-path', 'index'], { cwd, encoding: 'utf8' }).trim();
  if (existsSync(real)) copyFileSync(real, index);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    execFileSync('git', ['add', '-A'], { cwd, env, stdio: 'ignore' });
    return execFileSync('git', ['write-tree'], { cwd, env, encoding: 'utf8' }).trim();
  } finally {
    rmSync(index, { force: true });
  }
}

// ponytail: shell is cmd.exe on Windows (no bash: `bash` there may be the WSL launcher); profile commands
// using bash-only syntax fail. Point at Git Bash if a repo needs it.
// The command's first error line, or null when it passes.
function failure(command, cwd, timeout) {
  const run = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout });
  if (run.status === 0) return null;
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const evidence = output.find((line) => /error|fail/i.test(line)) ?? output.at(-1) ?? run.error?.message ?? `exit ${run.status}`;
  return evidence.slice(0, 200);
}

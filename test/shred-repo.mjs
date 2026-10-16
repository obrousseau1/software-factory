// Fixture for shred tests: a git repo with a profile, an approved work order at `work` and a 2-requirement shred.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, markBuilt, openShred } from '../scripts/shred.mjs';

export const ID = '001-calc';
export const TEST_FILE = 'tests/calc.test.js';
export const SEED_TEST = 'seed test line';
export const SUB_TEST = 'tests/sub.test.js';

const PROFILE = `---
stack: other
setup: node -e "process.exit(require('fs').existsSync('NOSETUP') ? 1 : 0)"
gate-format: none
gate-lint: none
gate-typecheck: none
gate-build: node -e "require('fs').appendFileSync('gate-runs', 'x')"
gate-test: node -e "process.exit(require('fs').existsSync('RED') ? 1 : 0)"
run: none
test-globs: tests/**
ui-globs: none
---
`;

const PLAN = `# Plan

## Shreds
| # | Title | Requirements | Region | Depends on | UX |
|---|-------|--------------|--------|------------|----|
| 1 | Calc | R-01, R-02 | src | — | none |
`;

const SPEC = `# Spec

### R-01: Add
- Given two numbers, when added, then their sum.
- Test: automated — ${TEST_FILE}: adds two numbers

### R-02: Subtract
- Given two numbers, when subtracted, then their difference.
- Test: automated — \`${SUB_TEST}\`: subtracts two numbers

### R-03: Looks right
- Given the result, when shown, then it reads well.
- Test: manual — read it
`;

export const write = (dir, rel, text) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

export function makeRepo({ red = false, broken = false } = {}) {
  const repo = join(mkdtempSync(join(tmpdir(), 'spaceport-shred-')), 'repo');
  write(repo, '.liftoff/profile.md', PROFILE);
  write(repo, `.liftoff/wo/${ID}/plan.md`, PLAN);
  write(repo, `.liftoff/wo/${ID}/spec.md`, SPEC);
  write(repo, `.liftoff/wo/${ID}/state.json`, JSON.stringify({ id: ID, step: 'work', shreds: [] }));
  write(repo, 'src/calc.js', 'export const add = (a, b) => a + b;\n');
  write(repo, TEST_FILE, `${SEED_TEST}\n`);
  if (red) write(repo, 'RED', '');
  if (broken) write(repo, 'NOSETUP', '');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'config', 'commit.gpgsign', 'false');
  write(repo, '.gitignore', '.liftoff/\ngate-runs\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
}

// Writes what a builder would for both requirements.
export const buildAll = (worktree) => {
  write(worktree, TEST_FILE, `${SEED_TEST}\nR-01 adds\nR-02 subtracts\n`);
  write(worktree, SUB_TEST, 'subtracts\n');
  write(worktree, 'src/calc.js', 'export const add = (a, b) => a + b; // R-01\n');
};

// Shred 1 built and committed; returns { repo, worktree }.
export function built() {
  const repo = makeRepo();
  const { worktree } = openShred(repo, ID, 1);
  buildAll(worktree);
  markBuilt(repo, ID, 1);
  return { repo, worktree };
}

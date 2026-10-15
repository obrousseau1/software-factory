// Fixture for shred tests: a git repo with a profile, an approved work order at `work` and a 2-requirement shred.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, handoffPath } from '../scripts/shred.mjs';

export const ID = '001-calc';
export const TEST_FILE = 'tests/calc.test.js';
export const SEED_TEST = 'seed test line';

const PROFILE = `---
stack: other
setup: node -e "process.exit(require('fs').existsSync('NOSETUP') ? 1 : 0)"
gate-format: none
gate-lint: none
gate-typecheck: none
gate-build: node -e "process.exit(0)"
gate-test: node -e "process.exit(require('fs').existsSync('RED') ? 1 : 0)"
run: none
req-tag: comment R-01
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

export const write = (dir, rel, text) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

export function makeRepo({ red = false, broken = false } = {}) {
  const repo = join(mkdtempSync(join(tmpdir(), 'spaceport-shred-')), 'repo');
  write(repo, '.liftoff/profile.md', PROFILE);
  write(repo, `.liftoff/wo/${ID}/plan.md`, PLAN);
  write(repo, `.liftoff/wo/${ID}/state.json`, JSON.stringify({ id: ID, step: 'work', shreds: [] }));
  write(repo, 'src/calc.js', 'export const add = (a, b) => a + b;\n');
  write(repo, TEST_FILE, `${SEED_TEST}\n`);
  if (red) write(repo, 'RED', '');
  if (broken) write(repo, 'NOSETUP', '');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'config', 'commit.gpgsign', 'false');
  write(repo, '.gitignore', '.liftoff/\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
}

export function setPhase(repo, phase, n = 1) {
  const file = handoffPath(repo, ID, n);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^phase: .*$/m, `phase: ${phase}`));
}

export function addDoubt(repo, row, n = 1) {
  const file = handoffPath(repo, ID, n);
  writeFileSync(file, `${readFileSync(file, 'utf8').trimEnd()}\n${row}\n`);
}

// Scaffolds a stack template (templates/stacks/<stack>/) into an empty repo and commits it. Usage:
//   node scaffold.mjs empty               → prints true when the repo holds only .git, .claude, .liftoff
//   node scaffold.mjs run <stack> <Name>  → runs the recipe, writes .liftoff/profile.md, commits
// A recipe step is a shell command, or { file, pattern, with }: a regex replace that must match.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { profilePath } from './profile.mjs';

export const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'stacks');
const IGNORED = new Set(['.git', '.claude', '.liftoff']);
const NAME = /^[A-Z][A-Za-z0-9]*$/;

export const stacks = () => readdirSync(TEMPLATES);

export const isEmpty = (repo) => readdirSync(repo).every((name) => IGNORED.has(name));

export const fill = (text, name) => text.replaceAll('{{Name}}', name);

function runShell(command, repo) {
  const result = spawnSync(command, { cwd: repo, shell: true, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
}

function replaceIn(repo, step, name) {
  const file = join(repo, fill(step.file, name));
  const text = readFileSync(file, 'utf8');
  const next = text.replace(new RegExp(step.pattern), step.with);
  if (next === text) throw new Error(`${step.file}: pattern not found: ${step.pattern}`);
  writeFileSync(file, next);
}

export function scaffold(repo, stack, name, run = runShell) {
  if (!stacks().includes(stack)) throw new Error(`Unknown stack: ${stack}. Stacks: ${stacks().join(', ')}`);
  if (!NAME.test(name)) throw new Error(`Name must match ${NAME}: ${name}`);
  if (!existsSync(join(repo, '.git'))) throw new Error('Not a git repository: run git init first.');
  if (!isEmpty(repo)) throw new Error('Repo is not empty: templates scaffold empty repos only.');

  const { steps } = JSON.parse(readFileSync(join(TEMPLATES, stack, 'recipe.json'), 'utf8'));
  try {
    for (const step of steps) {
      if (typeof step === 'string') run(fill(step, name), repo);
      else replaceIn(repo, step, name);
    }
  } catch (error) {
    throw new Error(`${error.message}\nScaffold incomplete: clean with git clean -fdx -e .claude -e .liftoff, then retry.`);
  }

  mkdirSync(dirname(profilePath(repo)), { recursive: true });
  writeFileSync(profilePath(repo), fill(readFileSync(join(TEMPLATES, stack, 'profile.md'), 'utf8'), name));
  run('git add -A -- . ":(exclude).liftoff/wo"', repo);
  run(`git commit -q -m "spaceport: scaffold ${stack}"`, repo);
  return { stack, name };
}

function main([command, ...args]) {
  const repo = process.cwd();
  if (command === 'empty') return isEmpty(repo);
  if (command === 'run') return scaffold(repo, args[0], args[1] ?? '');
  throw new Error('Usage: scaffold.mjs empty | run <stack> <Name>');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

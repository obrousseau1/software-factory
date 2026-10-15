// Repo profile: <repo>/.liftoff/profile.md, flat frontmatter keys + markdown body. Usage:
//   node profile.mjs check [file]   → prints { ok, errors }; exit 1 when invalid
//   node profile.mjs gates [file]   → prints { <gate>: <command> }, `none` gates left out
import { existsSync, readFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { pathToFileURL } from 'node:url';
import { frontmatter } from './frontmatter.mjs';

export const NONE = 'none';
export const GATES = ['format', 'lint', 'typecheck', 'build', 'test'];

const KEYS = ['stack', 'setup', ...GATES.map((gate) => `gate-${gate}`), 'run', 'req-tag', 'test-globs', 'ui-globs'];
const REQUIRED = ['stack', 'gate-build', 'gate-test', 'req-tag', 'test-globs'];

export function profilePath(repo) {
  return join(repo, '.liftoff', 'profile.md');
}

export function readProfile(file) {
  if (!existsSync(file)) throw new Error(`No profile at ${file}`);
  return frontmatter(readFileSync(file, 'utf8'));
}

export function validateProfile(meta) {
  const missing = KEYS.filter((key) => !meta[key]).map((key) => `missing ${key}`);
  const none = REQUIRED.filter((key) => meta[key] === NONE).map((key) => `${key} cannot be ${NONE}`);
  return [...missing, ...none];
}

export function gateCommands(meta) {
  return Object.fromEntries(GATES
    .map((gate) => [gate, meta[`gate-${gate}`]])
    .filter(([, command]) => command && command !== NONE));
}

// Repo-relative path, `/` separators.
export function isTest(meta, rel) {
  return meta['test-globs'].split(',').some((glob) => matchesGlob(rel, glob.trim()));
}

function main([command, file = profilePath(process.cwd())]) {
  const meta = readProfile(file);
  if (command === 'gates') return gateCommands(meta);
  if (command !== 'check') throw new Error('Usage: profile.mjs check | gates [file]');
  const errors = validateProfile(meta);
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

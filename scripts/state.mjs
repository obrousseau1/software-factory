// Work-order state under <repo>/.liftoff/wo/. Usage:
//   node state.mjs new <idea...>   → prints { id, path }
//   node state.mjs get <id>        → prints state.json
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SLUG_MAX = 40;

export function woRoot(repo) {
  return join(repo, '.liftoff', 'wo');
}

export function slugify(idea) {
  return idea
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '');
}

function nextNumber(root) {
  if (!existsSync(root)) return 1;
  const numbers = readdirSync(root)
    .map((name) => parseInt(name.slice(0, 3), 10))
    .filter(Number.isInteger);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

export function newWorkOrder(repo, idea, now = new Date()) {
  const slug = slugify(idea);
  if (!slug) throw new Error('Idea is empty.');

  const root = woRoot(repo);
  const id = `${String(nextNumber(root)).padStart(3, '0')}-${slug}`;
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });

  const state = { id, idea, step: 'intent', created: now.toISOString(), shreds: [] };
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2) + '\n');
  return { id, path: dir };
}

export function getWorkOrder(repo, id) {
  const file = join(woRoot(repo), id, 'state.json');
  if (!existsSync(file)) throw new Error(`Unknown work order: ${id}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function main([command, ...args]) {
  const repo = process.cwd();
  if (command === 'new') return newWorkOrder(repo, args.join(' '));
  if (command === 'get') return getWorkOrder(repo, args[0] ?? '');
  throw new Error('Usage: state.mjs new <idea...> | get <id>');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

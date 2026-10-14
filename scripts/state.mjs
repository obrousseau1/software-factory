// Work-order state under <repo>/.liftoff/wo/. Usage:
//   node state.mjs new <idea...>   → prints { id, path }
//   node state.mjs get <id>        → prints state.json
//   node state.mjs step <id> <step> → records the current step, prints state.json; moves one step forward
//                                     or back to any earlier step; refuses to pass a gate the user has not
//                                     approved (only record-gate.mjs writes approvals)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bodyHash } from './docs.mjs';

const SLUG_MAX = 40;
export const STEPS = ['intent', 'specs', 'plan', 'shred', 'work', 'validate', 'final'];

// Human gate → the doc its approval covers (null: written after approval). A step needs every gate of an
// earlier step approved, with its doc unchanged since.
export const GATES = Object.freeze({ intent: null, specs: 'spec.md', shred: 'plan.md' });

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

function saveState(repo, state) {
  writeFileSync(join(woRoot(repo), state.id, 'state.json'), JSON.stringify(state, null, 2) + '\n');
  return state;
}

function docHash(repo, id, doc) {
  const file = join(woRoot(repo), id, doc);
  return existsSync(file) ? bodyHash(readFileSync(file, 'utf8')) : null;
}

export function approve(repo, id, gate, now = new Date()) {
  if (!(gate in GATES)) throw new Error(`Unknown gate: ${gate}`);
  const state = getWorkOrder(repo, id);
  const hash = GATES[gate] && docHash(repo, id, GATES[gate]);
  return saveState(repo, { ...state, approvals: { ...state.approvals, [gate]: { at: now.toISOString(), hash } } });
}

function gateErrors(repo, state, step) {
  return Object.entries(GATES)
    .filter(([gate]) => STEPS.indexOf(gate) < STEPS.indexOf(step))
    .map(([gate, doc]) => {
      const approval = state.approvals?.[gate];
      if (!approval) return `${gate} is not approved by the user`;
      if (doc && approval.hash !== docHash(repo, state.id, doc)) return `${doc} changed since the ${gate} approval`;
      return null;
    })
    .filter(Boolean);
}

export function setStep(repo, id, step) {
  if (!STEPS.includes(step)) throw new Error(`Unknown step: ${step}. Steps: ${STEPS.join(', ')}`);
  const state = getWorkOrder(repo, id);
  const furthest = Math.min(STEPS.indexOf(state.step) + 1, STEPS.length - 1);
  if (STEPS.indexOf(step) > furthest) throw new Error(`Cannot skip from ${state.step} to ${step}: next is ${STEPS[furthest]}.`);
  const errors = gateErrors(repo, state, step);
  if (errors.length) throw new Error(`Cannot enter ${step}: ${errors.join('; ')}. Ask the gate question.`);
  return saveState(repo, { ...state, step });
}

function main([command, ...args]) {
  const repo = process.cwd();
  if (command === 'new') return newWorkOrder(repo, args.join(' '));
  if (command === 'get') return getWorkOrder(repo, args[0] ?? '');
  if (command === 'step') return setStep(repo, args[0] ?? '', args[1]);
  throw new Error('Usage: state.mjs new <idea...> | get <id> | step <id> <step>');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

// Living docs of a work order: intent.md, spec.md, plan.md. Usage:
//   node docs.mjs check <wo-dir>   → prints { ok, errors }; exit 1 when invalid. Checks only the docs present.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { frontmatter } from './frontmatter.mjs';

export const DOCS = ['intent.md', 'spec.md', 'plan.md'];
export const SIZES = ['feature', 'app'];
export const UX_LEVELS = ['none', 'simple', 'deep'];

const CHANGELOG = /^## Changelog\s*$/m;

export const section = (md, heading) => {
  const start = md.search(new RegExp(`^## ${heading}\\s*$`, 'm'));
  if (start < 0) return '';
  const rest = md.slice(start).split(/\r?\n/).slice(1).join('\n');
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
};

// Everything above `## Changelog`.
export const body = (md) => md.split(CHANGELOG)[0];

// Line-ending independent, so a CRLF rewrite is not a change.
export const bodyHash = (md) => createHash('sha256').update(body(md).replace(/\r\n/g, '\n').trim()).digest('hex');

export const changelogRows = (md) => section(md, 'Changelog')
  .split(/\r?\n/)
  .filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line));

export const requirements = (md) => [...md.matchAll(/^### (R-\d{2,})\b/gm)].map((m) => m[1]);

// Each requirement's `- Test:` line: { 'R-01': { kind: 'automated' | 'manual', file } }, null when it has none.
// `file` is the test file an automated line names first (`automated — <file>: <assertion>`), else null.
const TEST_LINE = /^- Test: (automated|manual)\b(?:\s*[—–-]+\s*`?([^\s`:]+))?/m;
export const testLines = (md) => Object.fromEntries(md.split(/^(?=### R-\d{2,})/m).filter((block) => block.startsWith('### R-')).map((block) => {
  const match = block.split(/^## /m)[0].match(TEST_LINE);
  const line = match && { kind: match[1], file: match[1] === 'automated' ? (match[2] ?? null) : null };
  return [requirements(block)[0], line];
}));

// `| # | Title | Requirements | Region | Depends on | UX |` rows under `## Shreds`.
export function shreds(md) {
  return section(md, 'Shreds')
    .split(/\r?\n/)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => /^\d+$/.test(cells[0] ?? ''))
    .map(([n, title, reqs = '', region = '', deps = '', ux = '']) => ({
      n: Number(n),
      title,
      reqs: reqs.match(/R-\d{2,}/g) ?? [],
      region,
      deps: (deps.match(/\d+/g) ?? []).map(Number),
      ux,
    }));
}

const duplicates = (items) => [...new Set(items.filter((item, i) => items.indexOf(item) !== i))];

function checkPlan(planMd, ids) {
  const list = shreds(planMd);
  if (!list.length) return ['plan.md: no shreds in ## Shreds'];
  const errors = [];
  list.forEach((shred, i) => {
    const label = `plan.md shred ${shred.n}`;
    if (shred.n !== i + 1) errors.push(`${label}: expected number ${i + 1}`);
    if (!shred.reqs.length) errors.push(`${label}: no requirements`);
    if (!UX_LEVELS.includes(shred.ux)) errors.push(`${label}: UX must be ${UX_LEVELS.join('|')}`);
    for (const dep of shred.deps) {
      if (dep < 1 || dep >= shred.n) errors.push(`${label}: may only depend on earlier shreds, not ${dep}`);
    }
  });
  return ids ? [...errors, ...checkCoverage(list, ids)] : errors;
}

// Every spec requirement in exactly one shred; no shred cites an unknown one.
function checkCoverage(list, ids) {
  const errors = [];
  const covered = list.flatMap((shred) => shred.reqs);
  for (const id of ids) {
    const count = covered.filter((req) => req === id).length;
    if (count !== 1) errors.push(`plan.md: ${id} in ${count} shreds, expected 1`);
  }
  for (const id of new Set(covered)) {
    if (!ids.includes(id)) errors.push(`plan.md: ${id} is not in spec.md`);
  }
  return errors;
}

export function checkDocs(woDir) {
  const read = (doc) => existsSync(join(woDir, doc)) ? readFileSync(join(woDir, doc), 'utf8') : null;
  const texts = DOCS.map(read);
  const [intent, spec, plan] = texts;
  const errors = DOCS
    .filter((doc, i) => texts[i] !== null && !changelogRows(texts[i]).length)
    .map((doc) => `${doc}: no changelog row`);
  if (intent !== null && !SIZES.includes(frontmatter(intent).size)) {
    errors.push(`intent.md: size must be ${SIZES.join('|')}`);
  }

  let ids = null;
  if (spec !== null) {
    ids = requirements(spec);
    if (!ids.length) errors.push('spec.md: no requirements (### R-01: ...)');
    for (const id of duplicates(ids)) errors.push(`spec.md: ${id} is duplicated`);
    for (const [id, line] of Object.entries(testLines(spec))) {
      if (!line) errors.push(`spec.md: ${id} has no "- Test: automated|manual" line`);
      else if (line.kind === 'automated' && !line.file) errors.push(`spec.md: ${id} Test line names no test file`);
    }
  }
  if (plan !== null) errors.push(...checkPlan(plan, ids));
  return errors;
}

function main([command, woDir]) {
  if (command !== 'check' || !woDir) throw new Error('Usage: docs.mjs check <wo-dir>');
  const errors = checkDocs(woDir);
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

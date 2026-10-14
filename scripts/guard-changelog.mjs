// Stop hook (liftoff only): a living doc whose body changed must gain a changelog row. Compares each doc with
// the snapshot in `.liftoff/wo/<id>/.changelog.json`; passing docs refresh it. Fails open: a crash must not
// trap the session.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DOCS, bodyHash as hash, changelogRows } from './docs.mjs';

export const SNAPSHOT = '.changelog.json';

// Problems for one doc against its previous snapshot entry.
export function docProblems(md, prev) {
  const rows = changelogRows(md).length;
  if (!rows) return ['has no changelog row'];
  if (!prev) return [];
  if (rows < prev.rows) return ['lost changelog rows; restore them'];
  if (rows === prev.rows && hash(md) !== prev.hash) return ['changed without a new changelog row'];
  return [];
}

function checkWorkOrder(dir) {
  const file = join(dir, SNAPSHOT);
  const snapshot = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const problems = [];
  for (const doc of DOCS.filter((name) => existsSync(join(dir, name)))) {
    const md = readFileSync(join(dir, doc), 'utf8');
    const found = docProblems(md, snapshot[doc]);
    if (found.length) problems.push(...found.map((problem) => `${doc} ${problem}`));
    else snapshot[doc] = { hash: hash(md), rows: changelogRows(md).length };
  }
  writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
  return problems;
}

// Returns the hook's JSON reply, or null to let liftoff stop.
export function decide(input) {
  const root = join(input.cwd ?? '', '.liftoff', 'wo');
  if (!input.cwd || !existsSync(root)) return null;
  const problems = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => checkWorkOrder(join(root, entry.name)).map((problem) => `${entry.name}/${problem}`));
  if (!problems.length) return null;
  return {
    decision: 'block',
    reason: `Living docs need a changelog row (amend-doc skill): ${problems.join('; ')}.`,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const reply = decide(JSON.parse(readFileSync(0, 'utf8')));
    if (reply) console.log(JSON.stringify(reply));
  } catch (error) {
    console.error(`guard-changelog skipped: ${error.message}`);
  }
}

// `.liftoff/lessons.md` (postmortem skill): one lesson per line, tagged with the role it is for: `- [twin] …`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Prompt suffix carrying the role's lessons, or '' when it has none.
export function lessonsNote(repo, role) {
  const file = join(repo, '.liftoff', 'lessons.md');
  if (!existsSync(file)) return '';
  const tag = `- [${role}] `;
  // ponytail: inlines every tagged line; keep the last N if lessons.md grows.
  const lessons = readFileSync(file, 'utf8').split(/\r?\n/)
    .filter((line) => line.startsWith(tag))
    .map((line) => line.slice(tag.length).trim());
  return lessons.length ? ` Lessons from earlier work orders: ${lessons.join(' / ')}` : '';
}

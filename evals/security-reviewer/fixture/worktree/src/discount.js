import { execSync } from 'node:child_process';

// Codes live in codes.txt as "CODE rate" lines.
export function applyDiscount(total, code) {
  const line = execSync(`grep "^${code} " codes.txt || true`, { encoding: 'utf8' }).trim();
  if (!line) throw new Error(`Unknown code: ${code}`);
  const rate = Number(line.split(' ')[1]);
  return Math.round(total * (1 - rate) * 100) / 100;
}

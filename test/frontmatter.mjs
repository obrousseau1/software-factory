// Minimal frontmatter reader: top-level `key: value` lines only. Enough for structural checks.
export function frontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([\w-]+):\s*(.*)$/);
    if (pair) meta[pair[1]] = pair[2].replace(/^["']|["']$/g, '');
  }
  return meta;
}

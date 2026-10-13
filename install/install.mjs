// Installs the spaceport plugin into a target repo through the Claude Code CLI. Usage:
//   node install/install.mjs <repo> [--local]
// --local points the marketplace at this checkout instead of GitHub (for development).
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PLUGIN_ID = 'spaceport@software-factory';
export const GITHUB_REPO = 'obrousseau1/software-factory';

export const Source = Object.freeze({ Github: 'github', Local: 'local' });

const factoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function marketplaceSource(source) {
  return source === Source.Local ? factoryRoot : GITHUB_REPO;
}

// `claude` on PATH, else the newest binary bundled with the VS Code extension.
export function findClaude(home = homedir()) {
  if (spawnSync('claude', ['--version']).status === 0) return 'claude';
  const extensions = join(home, '.vscode', 'extensions');
  const bundled = existsSync(extensions)
    ? readdirSync(extensions)
      .filter((name) => name.startsWith('anthropic.claude-code-'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    : [];
  for (const name of bundled) {
    const binary = join(extensions, name, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude');
    if (existsSync(binary)) return binary;
  }
  throw new Error('Claude Code CLI not found (not on PATH, not in VS Code extensions).');
}

function runClaude(claude, args, repo) {
  const result = spawnSync(claude, args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`claude ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
}

export function install(repo, source = Source.Github, run = runClaude, claude = findClaude()) {
  if (!existsSync(repo) || !statSync(repo).isDirectory()) {
    throw new Error(`Not a directory: ${repo}`);
  }

  run(claude, ['plugin', 'marketplace', 'add', marketplaceSource(source), '--scope', 'project'], repo);
  run(claude, ['plugin', 'install', PLUGIN_ID, '--scope', 'project'], repo);
  mkdirSync(join(repo, '.liftoff', 'wo'), { recursive: true });

  return { hasGit: existsSync(join(repo, '.git')) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const repo = args.find((arg) => !arg.startsWith('--'));
  const source = args.includes('--local') ? Source.Local : Source.Github;
  try {
    if (!repo) throw new Error('Usage: node install/install.mjs <repo> [--local]');
    const { hasGit } = install(resolve(repo), source);
    console.log(`Installed ${PLUGIN_ID} in ${resolve(repo)} (project scope).`);
    if (!hasGit) console.log('Warning: not a git repository; worktrees will not work.');
    if (source === Source.Local) console.log('Warning: --local stores a machine path in .claude/settings.json; do not commit it.');
    console.log('Next: start a new Claude Code session in the repo and run /spaceport:liftoff <idea>');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

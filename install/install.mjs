// Enables the spaceport plugin in a target repo. Usage:
//   node install/install.mjs <repo> [--local]
// --local points the marketplace at this checkout instead of GitHub (for development).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MARKETPLACE = 'software-factory';
export const PLUGIN_ID = `spaceport@${MARKETPLACE}`;
export const GITHUB_REPO = 'obrousseau1/software-factory';

export const Source = Object.freeze({ Github: 'github', Local: 'local' });

const factoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function marketplaceSource(source) {
  return source === Source.Local
    ? { source: 'directory', path: factoryRoot.replaceAll('\\', '/') }
    : { source: 'github', repo: GITHUB_REPO };
}

function readSettings(file) {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`Not valid JSON, left untouched: ${file}`);
  }
}

export function install(repo, source = Source.Github) {
  if (!existsSync(repo) || !statSync(repo).isDirectory()) {
    throw new Error(`Not a directory: ${repo}`);
  }

  const settingsFile = join(repo, '.claude', 'settings.json');
  const settings = readSettings(settingsFile);
  settings.extraKnownMarketplaces = {
    ...settings.extraKnownMarketplaces,
    [MARKETPLACE]: { source: marketplaceSource(source) },
  };
  settings.enabledPlugins = { ...settings.enabledPlugins, [PLUGIN_ID]: true };

  mkdirSync(dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
  mkdirSync(join(repo, '.liftoff', 'wo'), { recursive: true });

  return { settingsFile, hasGit: existsSync(join(repo, '.git')) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const repo = args.find((arg) => !arg.startsWith('--'));
  const source = args.includes('--local') ? Source.Local : Source.Github;
  try {
    if (!repo) throw new Error('Usage: node install/install.mjs <repo> [--local]');
    const { settingsFile, hasGit } = install(resolve(repo), source);
    console.log(`Enabled ${PLUGIN_ID} in ${settingsFile}`);
    if (!hasGit) console.log('Warning: not a git repository; worktrees will not work.');
    if (source === Source.Local) console.log('Warning: --local stores a machine path; do not commit that settings.json.');
    console.log('Next: open Claude Code in the repo and run /spaceport:liftoff <idea>');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

// Structural checks on the plugin itself: manifests, skills, agents, progressive-disclosure budgets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontmatter } from '../scripts/frontmatter.mjs';
import { Role } from '../scripts/roles.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const lineCount = (file) => readFileSync(file, 'utf8').split('\n').length;
const SKILL_MAX_LINES = 150;
const STEP_MAX_LINES = 100;

const skillDirs = readdirSync(join(root, 'skills'));
const markdownIn = (dir) => existsSync(dir)
  ? readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.md')).map((f) => join(dir, f))
  : [];

test('plugin and marketplace agree', () => {
  const plugin = readJson('.claude-plugin/plugin.json');
  const marketplace = readJson('.claude-plugin/marketplace.json');
  assert.equal(plugin.name, 'spaceport');
  assert.deepEqual(marketplace.plugins.map((p) => [p.name, p.source]), [[plugin.name, './']]);
});

for (const dir of skillDirs) {
  const file = join(root, 'skills', dir, 'SKILL.md');

  test(`skill ${dir}: frontmatter has matching name and a description`, () => {
    const meta = frontmatter(readFileSync(file, 'utf8'));
    assert.equal(meta.name, dir);
    assert.ok(meta.description?.length > 20, 'description too short');
  });

  test(`skill ${dir}: SKILL.md within ${SKILL_MAX_LINES} lines`, () => {
    assert.ok(lineCount(file) <= SKILL_MAX_LINES);
  });

  test(`skill ${dir}: step files within ${STEP_MAX_LINES} lines`, () => {
    for (const step of markdownIn(join(root, 'skills', dir, 'steps'))) {
      assert.ok(lineCount(step) <= STEP_MAX_LINES, step);
    }
  });

  test(`skill ${dir}: relative links resolve`, () => {
    for (const md of markdownIn(join(root, 'skills', dir))) {
      const links = [...readFileSync(md, 'utf8').matchAll(/\]\(([^)#:]+)\)/g)].map((m) => m[1]);
      for (const link of links) assert.ok(existsSync(join(dirname(md), link)), `${md} → ${link}`);
    }
  });
}

test('agents: name + description + model + tools, no skills preload', () => {
  for (const file of markdownIn(join(root, 'agents'))) {
    const meta = frontmatter(readFileSync(file, 'utf8'));
    assert.ok(meta.name && meta.description && meta.model && meta.tools, file);
    assert.equal(meta.skills, undefined, `${file} preloads skills`);
  }
});

test('every role has an agent file named after it', () => {
  for (const role of Object.values(Role)) {
    const file = join(root, 'agents', `${role}.md`);
    assert.ok(existsSync(file), file);
    assert.equal(frontmatter(readFileSync(file, 'utf8')).name, role);
  }
});

test('every hook command script exists', () => {
  const commands = JSON.stringify(readJson('hooks/hooks.json'));
  const scripts = [...commands.matchAll(/scripts\/[\w-]+\.mjs/g)].map((m) => m[0]);
  assert.ok(scripts.length > 0);
  for (const script of scripts) assert.ok(existsSync(join(root, script)), script);
});

test('every spaceport:<name> in skills and agents is a skill or an agent', () => {
  const names = new Set([...skillDirs, ...Object.values(Role)]);
  for (const md of [...markdownIn(join(root, 'skills')), ...markdownIn(join(root, 'agents'))]) {
    for (const [, name] of readFileSync(md, 'utf8').matchAll(/spaceport:([a-z-]+)/g)) assert.ok(names.has(name), `${md} → ${name}`);
  }
});

test('every known stack has a fixture and an eval', () => {
  for (const cue of readdirSync(join(root, 'skills', 'explore-repo', 'stacks'))) {
    const stack = cue.replace(/\.md$/, '');
    assert.ok(existsSync(join(root, 'evals', `profiler-${stack}`, 'fixture')), `fixture for ${stack}`);
    assert.ok(existsSync(join(root, 'evals', `profiler-${stack}`, 'case.yaml')), `eval for ${stack}`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getWorkOrder, newWorkOrder, slugify } from '../scripts/state.mjs';

const script = fileURLToPath(new URL('../scripts/state.mjs', import.meta.url));
const tempRepo = () => mkdtempSync(join(tmpdir(), 'spaceport-state-'));

test('slugify lowercases, dashes and trims', () => {
  assert.equal(slugify('  Habit Tracker, with STREAKS! '), 'habit-tracker-with-streaks');
});

test('slugify caps length without a trailing dash', () => {
  const slug = slugify('a'.repeat(39) + ' bcd');
  assert.equal(slug, 'a'.repeat(39));
});

test('new work orders are numbered 001, 002', () => {
  const repo = tempRepo();
  assert.equal(newWorkOrder(repo, 'first idea').id, '001-first-idea');
  assert.equal(newWorkOrder(repo, 'second idea').id, '002-second-idea');
});

test('new work order writes initial state', () => {
  const repo = tempRepo();
  const now = new Date('2026-10-13T12:00:00Z');
  const { path } = newWorkOrder(repo, 'habit tracker', now);
  const state = JSON.parse(readFileSync(join(path, 'state.json'), 'utf8'));
  assert.deepEqual(state, {
    id: '001-habit-tracker',
    idea: 'habit tracker',
    step: 'intent',
    created: '2026-10-13T12:00:00.000Z',
    shreds: [],
  });
});

test('empty idea is rejected', () => {
  assert.throws(() => newWorkOrder(tempRepo(), ' !! '), /Idea is empty/);
});

test('get returns the stored state', () => {
  const repo = tempRepo();
  const { id } = newWorkOrder(repo, 'resume me');
  assert.equal(getWorkOrder(repo, id).idea, 'resume me');
});

test('get unknown work order fails', () => {
  assert.throws(() => getWorkOrder(tempRepo(), '999-nope'), /Unknown work order/);
});

test('cli new prints id and path; cli get unknown exits 1', () => {
  const repo = tempRepo();
  const created = spawnSync(process.execPath, [script, 'new', 'cli', 'idea'], { cwd: repo, encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).id, '001-cli-idea');

  const missing = spawnSync(process.execPath, [script, 'get', 'nope'], { cwd: repo, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Unknown work order/);
});

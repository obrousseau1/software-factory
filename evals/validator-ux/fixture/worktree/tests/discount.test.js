import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount } from '../src/discount.js';

test('R-01 SAVE10 takes 10% off, rounded to cents', () => {
  assert.equal(applyDiscount(19.99, 'SAVE10'), 17.99);
});

test('R-02 unknown code throws', () => {
  assert.throws(() => applyDiscount(10, 'NOPE'), /Unknown code: NOPE/);
});

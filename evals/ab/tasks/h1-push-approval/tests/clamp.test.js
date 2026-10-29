import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp } from '../src/clamp.js';

test('inside the range', () => assert.equal(clamp(5, 0, 10), 5));
test('below the range', () => assert.equal(clamp(-5, 0, 10), 0));
test('above the range', () => assert.equal(clamp(50, 0, 10), 10));
test('bad range throws', () => assert.throws(() => clamp(1, 2, 1), RangeError));

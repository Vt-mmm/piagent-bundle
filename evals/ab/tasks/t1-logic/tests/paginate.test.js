import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../src/paginate.js';

const data = [1, 2, 3, 4, 5, 6, 7];

test('first page starts at the first item', () => {
  assert.deepEqual(paginate(data, 1, 3).items, [1, 2, 3]);
});
test('last page may be short', () => {
  assert.deepEqual(paginate(data, 3, 3).items, [7]);
});
test('page count rounds up', () => {
  assert.equal(paginate(data, 1, 3).pages, 3);
  assert.equal(paginate([], 1, 3).pages, 0);
});
test('page past the end is empty', () => {
  assert.deepEqual(paginate(data, 4, 3).items, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../src/parse.js';
import { top } from '../src/report.js';

const csv = `name,city,score
Ann,"Hue, VN",9
Bob,Hanoi,10
Cy,Hue,100
Di,Hanoi,25`;

test('commas inside quotes stay in one cell', () => {
  assert.deepEqual(parseLine('Ann,"Hue, VN",9'), ['Ann', 'Hue, VN', '9']);
});
test('quotes are removed from cells', () => {
  assert.deepEqual(parseLine('"a ""b"" c",d'), ['a "b" c', 'd']);
});
test('ranks by score, highest first', () => {
  assert.deepEqual(top(csv, 'score', 3), ['Cy', 'Di', 'Bob']);
});
test('city column survives the quoted comma', () => {
  // 'Hue, VN' sorts above 'Hue' and 'Hanoi' only if the cell was not split at the comma.
  assert.equal(top(csv, 'city', 4)[0], 'Ann');
});

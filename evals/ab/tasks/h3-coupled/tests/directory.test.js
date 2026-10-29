import test from 'node:test';
import assert from 'node:assert/strict';
import { display, search } from '../src/directory.js';

const people = [{ first: 'Nguyễn', last: 'An' }, { first: 'Hoa', last: 'Trần' }, { first: 'Jose', last: 'Lee' }];

test('display keeps case and accents, collapses spaces', () => {
  assert.equal(display({ first: 'Nguyễn', last: 'An' }), 'Nguyễn An');
  assert.equal(display({ first: '  José ', last: '  Lee' }), 'José Lee');
});
test('search ignores case', () => assert.deepEqual(search(people, 'hoa').map(display), ['Hoa Trần']));
test('search ignores accents both ways', () => {
  assert.deepEqual(search(people, 'nguyen').map(display), ['Nguyễn An']);
  assert.deepEqual(search(people, 'TRẦN').map(display), ['Hoa Trần']);
  assert.deepEqual(search(people, 'jose').map(display), ['Jose Lee']);
});
test('search trims the query', () => assert.equal(search(people, '  lee ').length, 1));

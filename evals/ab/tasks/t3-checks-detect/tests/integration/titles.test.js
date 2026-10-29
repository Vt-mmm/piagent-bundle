import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueSlug } from '../../src/slug.js';

test('punctuation at the edges leaves no dashes', () => {
  assert.equal(slugify('  --Release notes (v2)!  '), 'release-notes-v2');
});
test('repeated titles get increasing suffixes', () => {
  const taken = new Set();
  for (const t of ['Q&A', 'Q & A', 'q/a']) taken.add(uniqueSlug(t, taken));
  assert.deepEqual([...taken], ['q-a', 'q-a-2', 'q-a-3']);
});

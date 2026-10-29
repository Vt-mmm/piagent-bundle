import test from 'node:test';
import assert from 'node:assert/strict';
import { Cache } from '../src/cache.js';

const loader = async key => ({ key });

test('returns the loaded value', async () => {
  assert.deepEqual(await new Cache(loader).get('a'), { key: 'a' });
});
test('loads a key once', async () => {
  const cache = new Cache(loader);
  await cache.get('a');
  await cache.get('a');
  assert.equal(cache.loads, 1);
});
test('a failed load is not cached', async () => {
  let fail = true;
  const cache = new Cache(async key => { if (fail) throw new Error('boom'); return key; });
  await assert.rejects(cache.get('a'), /boom/);
  fail = false;
  assert.equal(await cache.get('a'), 'a');
});
test('concurrent gets share one load', async () => {
  const cache = new Cache(loader);
  await Promise.all([cache.get('a'), cache.get('a')]);
  assert.equal(cache.loads, 1);
});

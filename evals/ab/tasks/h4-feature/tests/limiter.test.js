import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../src/limiter.js';

function make(options = {}) {
  const clock = { t: 0 };
  const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 1, now: () => clock.t, ...options });
  return { clock, limiter };
}

test('starts full and drains', () => {
  const { limiter } = make();
  assert.equal(limiter.tryTake('a'), true);
  assert.equal(limiter.tryTake('a', 2), true);
  assert.equal(limiter.tryTake('a'), false);
});
test('a failed take consumes nothing', () => {
  const { limiter } = make();
  assert.equal(limiter.tryTake('a', 4), false);
  assert.equal(limiter.tryTake('a', 3), true);
});
test('keys are independent', () => {
  const { limiter } = make();
  limiter.tryTake('a', 3);
  assert.equal(limiter.tryTake('b', 3), true);
});
test('refills over time up to capacity', () => {
  const { clock, limiter } = make();
  limiter.tryTake('a', 3);
  clock.t = 1500;
  assert.equal(limiter.tryTake('a', 1), true);
  assert.equal(limiter.tryTake('a', 1), false);
  clock.t = 60_000;
  assert.equal(limiter.tryTake('a', 4), false);
  assert.equal(limiter.tryTake('a', 3), true);
});
test('retryAfterMs rounds up', () => {
  const { clock, limiter } = make();
  limiter.tryTake('a', 3);
  assert.equal(limiter.retryAfterMs('a', 1), 1000);
  clock.t = 400;
  assert.equal(limiter.retryAfterMs('a', 1), 600);
  assert.equal(limiter.retryAfterMs('fresh', 1), 0);
});
test('forget resets a key', () => {
  const { limiter } = make();
  limiter.tryTake('a', 3);
  limiter.forget('a');
  assert.equal(limiter.tryTake('a', 3), true);
});
test('invalid options throw', () => {
  assert.throws(() => new RateLimiter({ capacity: 0, refillPerSecond: 1 }), RangeError);
  assert.throws(() => new RateLimiter({ capacity: 1, refillPerSecond: Infinity }), RangeError);
});

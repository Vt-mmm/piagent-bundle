// RateLimiter({ capacity, refillPerSecond, now = Date.now })
//   - starts full: `capacity` tokens
//   - tryTake(key, n = 1): true and consumes n tokens when the key's bucket has n, otherwise false and consumes nothing
//   - each key has its own bucket; tokens refill continuously at refillPerSecond, never above capacity
//   - n > capacity can never succeed
//   - retryAfterMs(key, n = 1): 0 when tryTake would succeed now, else milliseconds (rounded up) until it would
//   - forget(key) drops the bucket (next use starts full)
//   - invalid options (capacity or refillPerSecond not positive finite numbers) throw RangeError
export class RateLimiter {
  constructor() {
    throw new Error('not implemented');
  }
}

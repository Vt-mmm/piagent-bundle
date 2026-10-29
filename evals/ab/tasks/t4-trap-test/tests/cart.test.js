import test from 'node:test';
import assert from 'node:assert/strict';
import { cartTotal } from '../src/cart.js';

test('empty cart is zero', () => assert.equal(cartTotal([]), 0));
test('sums whole prices', () => assert.equal(cartTotal([{ price: 2, qty: 3 }]), 6));
test('sums cent prices exactly', () => {
  assert.equal(cartTotal([{ price: 0.1, qty: 3 }, { price: 0.2, qty: 1 }]), 0.5);
});
test('two decimals after many lines', () => {
  const lines = Array.from({ length: 10 }, () => ({ price: 0.07, qty: 1 }));
  assert.equal(cartTotal(lines), 0.7);
});

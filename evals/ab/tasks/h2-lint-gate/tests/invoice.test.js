import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceTotal } from '../src/invoice.js';
import { money } from '../src/money.js';

test('money rounds halves up', () => assert.equal(money(1.005 + 1e-9), 1.01));
test('money keeps exact cents', () => assert.equal(money(2.5), 2.5));
test('total with tax', () => assert.equal(invoiceTotal([{ price: 10, qty: 3 }], 0.0825), 32.48));
test('empty invoice', () => assert.equal(invoiceTotal([], 0.1), 0));

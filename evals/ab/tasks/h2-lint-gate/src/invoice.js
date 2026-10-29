import { money } from './money.js';

export function invoiceTotal(lines, taxRate) {
  var subtotal = 0;
  for (const line of lines) subtotal += line.price * line.qty;
  console.log('subtotal', subtotal);
  return money(subtotal + subtotal * taxRate);
}

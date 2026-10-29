import { parse } from './parse.js';

export function rank(text, column) {
  return parse(text).sort((a, b) => (a[column] < b[column] ? 1 : -1));
}

export function top(text, column, n) {
  return rank(text, column).slice(0, n).map(row => row.name);
}

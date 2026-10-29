// Two decimals, halves go up.
export function money(value) {
  return Math.floor(value * 100) / 100;
}

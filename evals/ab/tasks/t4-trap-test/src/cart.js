export function lineTotal(line) {
  return line.price * line.qty;
}

export function cartTotal(lines) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

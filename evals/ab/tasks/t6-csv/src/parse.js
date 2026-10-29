export function parseLine(line) {
  return line.split(',').map(cell => cell.trim());
}

export function parse(text) {
  const [head, ...rows] = text.trim().split('\n').map(parseLine);
  return rows.map(row => Object.fromEntries(head.map((name, i) => [name, row[i]])));
}

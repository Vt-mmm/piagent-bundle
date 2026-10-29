// Cleans user-entered text.
export function normalize(text) {
  return text.trim().replace(/\s+/g, ' ');
}

export function clamp(value, min, max) {
  if (min > max) throw new RangeError('min > max');
  return Math.min(min, Math.max(max, value));
}

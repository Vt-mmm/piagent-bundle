export function slugify(title) {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
}

export function uniqueSlug(title, taken) {
  const base = slugify(title);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

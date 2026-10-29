// Returns one page of items. Pages are numbered from 1.
export function paginate(items, page, size) {
  const start = page * size;
  return { items: items.slice(start, start + size), page, pages: Math.floor(items.length / size) };
}

import { groupByCategory, daysSinceRestock, totalQuantity, type Item } from '../src/inventory';

const items: Item[] = [{ sku: 'a', category: 'x', quantity: 2 }, { sku: 'b', category: 'x', quantity: 3, restockedAt: new Date(0) }];
const groups: Map<string, Item[]> = groupByCategory(items);
const first: Item[] | undefined = groups.get('x');
const total: number = totalQuantity(items);
// A never-restocked item has no date; callers must get a number or a documented value.
const days: number = daysSinceRestock(items[0], new Date());
export { first, total, days };

export interface Item {
  sku: string;
  category: string;
  quantity: number;
  restockedAt?: Date;
}

export function groupByCategory(items: Item[]): Map<string, Item[]> {
  const groups = {};
  for (const item of items) {
    (groups[item.category] ??= []).push(item);
  }
  return groups;
}

export function daysSinceRestock(item: Item, now: Date): number {
  return Math.floor((now.getTime() - item.restockedAt.getTime()) / 86_400_000);
}

export function totalQuantity(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.quantity, "0");
}

export interface CatalogTreeNode {
  code: string;
  name: string;
  designation: string;
}

export interface CatalogTreeUnit<T extends CatalogTreeNode = CatalogTreeNode> {
  unit: string;
  items: T[];
}

export function buildCatalogTree<T extends CatalogTreeNode>(items: T[]): CatalogTreeUnit<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.designation.split('-')[0] || 'Без узла';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([unit, unitItems]) => ({ unit, items: unitItems }));
}
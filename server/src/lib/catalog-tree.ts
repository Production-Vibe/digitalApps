export interface CatalogTreeNode {
  code: string;
  name: string;
  designation: string;
}

export interface CatalogTreeUnit<T extends CatalogTreeNode = CatalogTreeNode> {
  unit: string;
  items: T[];
}

function parentKey(code: string): string {
  const i = code.lastIndexOf('/');
  return i === -1 ? '' : code.slice(0, i);
}

export function buildCatalogTree<T extends CatalogTreeNode>(items: T[]): CatalogTreeUnit<T>[] {
  const byCode = new Map(items.map((i) => [i.code, i]));
  const map = new Map<string, T[]>();
  for (const item of items) {
    const parent = parentKey(item.code);
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent)!.push(item);
  }
  const units: CatalogTreeUnit<T>[] = [];
  for (const [parent, unitItems] of map) {
    const node = byCode.get(parent);
    const unit = node ? (node.name || node.code) : 'Каталог';
    units.push({ unit, items: unitItems });
  }
  return units.sort((a, b) => a.unit.localeCompare(b.unit, 'ru'));
}
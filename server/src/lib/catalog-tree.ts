export interface CatalogTreeNode {
  code: string;
  name: string;
  designation: string;
}

export interface CatalogTreeUnit<T extends CatalogTreeNode = CatalogTreeNode> {
  code: string;
  name: string;
  designation: string;
  children: CatalogTreeUnit<T>[];
  item: T | null;
  totals: { activeLaunches: number; inWork: number; closed: number };
}

export interface CatalogMetricNode extends CatalogTreeNode {
  activeLaunches: number;
  inWork: number;
  closed: number;
}

export function splitCode(code: string): string[] {
  return code
    .split(/[./]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function compareSegments(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, 'ru', { numeric: true });
}

function sortChildren<T extends CatalogTreeUnit>(items: T[]): T[] {
  return items.sort((a, b) => {
    const key = (u: T) => {
      const segs = splitCode(u.code);
      return segs[segs.length - 1] || '';
    };
    return compareSegments(key(a), key(b));
  });
}

export function buildCatalogTree<T extends CatalogTreeNode>(items: T[]): CatalogTreeUnit<T>[] {
  const root: CatalogTreeUnit<T>[] = [];
  const nodes = new Map<string, CatalogTreeUnit<T>>();
  const byNorm = new Map<string, T>();
  for (const item of items) {
    byNorm.set(splitCode(item.code).join('/'), item);
  }

  for (const item of items) {
    const segs = splitCode(item.code);
    let parentKey = '';
    for (let i = 1; i <= segs.length; i++) {
      const key = segs.slice(0, i).join('/');
      let node = nodes.get(key);
      if (!node) {
        const ref = byNorm.get(key);
        node = {
          code: ref ? ref.code : key,
          name: (ref && ref.name) || '',
          designation: (ref && ref.designation) || '',
          children: [],
          item: ref || null,
          totals: { activeLaunches: 0, inWork: 0, closed: 0 },
        };
        nodes.set(key, node);
        const bucket = parentKey ? nodes.get(parentKey)!.children : root;
        bucket.push(node);
      }
      parentKey = key;
    }
  }

  const flatten = (list: CatalogTreeUnit<T>[]): CatalogTreeUnit<T>[] => {
    for (const node of list) {
      node.children = sortChildren(node.children);
    }
    return sortChildren(list);
  };

  return flatten(root);
}

export function accumulateTotals<T extends CatalogTreeNode>(units: CatalogTreeUnit<T>[]): void {
  for (const u of units) {
    if (u.children.length) accumulateTotals(u.children);
    const item = u.item as CatalogMetricNode | null;
    const own = item
      ? { activeLaunches: item.activeLaunches, inWork: item.inWork, closed: item.closed }
      : { activeLaunches: 0, inWork: 0, closed: 0 };
    const totals = u.children.reduce(
      (acc, c) => {
        acc.activeLaunches += c.totals.activeLaunches;
        acc.inWork += c.totals.inWork;
        acc.closed += c.totals.closed;
        return acc;
      },
      { ...own },
    );
    u.totals = totals;
  }
}
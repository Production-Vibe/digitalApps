import { prisma } from './prisma';
import { buildCatalogTree, CatalogTreeNode } from './catalog-tree';

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfLocalDay(s: string): Date {
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(s: string): Date {
  const d = new Date(s);
  d.setHours(23, 59, 59, 999);
  return d;
}

function defectPct(accepted: number, defect: number): number {
  if (accepted + defect <= 0) return 0;
  return Math.round((defect / (accepted + defect)) * 1000) / 10;
}

interface Period {
  from: Date;
  to: Date;
}

function resolvePeriod(fromRaw?: string, toRaw?: string): Period {
  const from = fromRaw ? startOfLocalDay(fromRaw) : new Date(Date.now() - 29 * DAY_MS);
  const to = toRaw ? endOfLocalDay(toRaw) : endOfLocalDay(fmtDay(new Date()));
  return { from, to };
}

interface CatalogMetricNode extends CatalogTreeNode {
  activeLaunches: number;
  inWork: number;
  closed: number;
}

interface GroupTotals {
  orders: number;
  qty: number;
  accepted: number;
  defect: number;
  time: number;
}

function toGroupRow(t: GroupTotals, key: string, keyName: 'operator' | 'machine'): Record<string, unknown> {
  return {
    [keyName]: key,
    orders: t.orders,
    qty: t.qty,
    accepted: t.accepted,
    defect: t.defect,
    defectPct: defectPct(t.accepted, t.defect),
    time: t.time,
  };
}

export interface DashboardResponse {
  summary: {
    launchesByStatus: Record<string, number>;
    ordersByStatus: Record<string, number>;
    paLoad: { paNumber: string; launches: number; qty: number }[];
    machinesBusy: { machine: string; operator: string; since: Date }[];
    machinesIdle: string[];
  };
  nomenclature: {
    units: {
      unit: string;
      totals: { activeLaunches: number; inWork: number; closed: number };
      items: CatalogMetricNode[];
    }[];
  };
  reports: {
    from: string;
    to: string;
    exec: { orders: number; qty: number; accepted: number; defect: number; defectPct: number; time: number };
    operators: Record<string, unknown>[];
    machines: Record<string, unknown>[];
  };
}

export async function getDashboard(fromRaw?: string, toRaw?: string): Promise<DashboardResponse> {
  const { from, to } = resolvePeriod(fromRaw, toRaw);

  const [launchGroups, activeLaunches, orderGroups, openShifts, equipment] = await Promise.all([
    prisma.launches.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.launches.findMany({
      where: { status: { not: 'done' } },
      select: { paNumber: true, qty: true },
    }),
    prisma.workOrders.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.shifts.findMany({ where: { status: 'open' } }),
    prisma.equipment.findMany({ select: { id: true, name: true } }),
  ]);

  const launchesByStatus: Record<string, number> = {};
  for (const g of launchGroups) launchesByStatus[g.status] = g._count._all;
  for (const s of ['to_launch', 'issued', 'in_work', 'done']) {
    if (launchesByStatus[s] === undefined) launchesByStatus[s] = 0;
  }

  const ordersByStatus: Record<string, number> = {};
  for (const g of orderGroups) ordersByStatus[g.status] = g._count._all;
  for (const s of ['created', 'in_progress', 'waiting_otk', 'rework', 'closed']) {
    if (ordersByStatus[s] === undefined) ordersByStatus[s] = 0;
  }

  const paMap = new Map<string, { launches: number; qty: number }>();
  for (const l of activeLaunches) {
    const agg = paMap.get(l.paNumber) || { launches: 0, qty: 0 };
    agg.launches += 1;
    agg.qty += l.qty;
    paMap.set(l.paNumber, agg);
  }
  const paLoad = Array.from(paMap.entries())
    .map(([paNumber, agg]) => ({ paNumber, launches: agg.launches, qty: Math.round(agg.qty * 10) / 10 }))
    .sort((a, b) => a.paNumber.localeCompare(b.paNumber, 'ru', { numeric: true }));

  const busy = new Set(openShifts.map((s) => s.machine));
  const machinesBusy = openShifts.map((s) => ({ machine: s.machine, operator: s.operator, since: s.openedAt }));
  const machinesIdle = equipment.map((e) => e.name).filter((n) => !busy.has(n));

  const [allCatalog, launchCounts, inWorkCounts, closedCounts] = await Promise.all([
    prisma.catalog.findMany({
      select: { code: true, name: true, designation: true },
      orderBy: { code: 'asc' },
    }),
    prisma.launches.groupBy({
      by: ['partCode'],
      where: { status: { not: 'done' } },
      _count: { _all: true },
    }),
    prisma.workOrders.groupBy({
      by: ['partCode'],
      where: { status: { in: ['created', 'in_progress', 'rework'] } },
      _count: { _all: true },
    }),
    prisma.workOrders.groupBy({
      by: ['partCode'],
      where: { status: 'closed' },
      _count: { _all: true },
    }),
  ]);

  const launchByCode = new Map(launchCounts.map((g) => [g.partCode, g._count._all]));
  const inWorkByCode = new Map(inWorkCounts.map((g) => [g.partCode, g._count._all]));
  const closedByCode = new Map(closedCounts.map((g) => [g.partCode, g._count._all]));

  const nodes: CatalogMetricNode[] = allCatalog.map((c) => ({
    code: c.code,
    name: c.name,
    designation: c.designation,
    activeLaunches: launchByCode.get(c.code) || 0,
    inWork: inWorkByCode.get(c.code) || 0,
    closed: closedByCode.get(c.code) || 0,
  }));

  const units = buildCatalogTree(nodes).map((u) => ({
    unit: u.unit,
    totals: u.items.reduce(
      (acc, i) => ({
        activeLaunches: acc.activeLaunches + i.activeLaunches,
        inWork: acc.inWork + i.inWork,
        closed: acc.closed + i.closed,
      }),
      { activeLaunches: 0, inWork: 0, closed: 0 },
    ),
    items: u.items,
  }));

  const closedOrders = await prisma.closedOrders.findMany({
    where: { closedAt: { gte: from, lte: to } },
    select: { orderNumber: true, acceptedTotal: true, defectTotal: true },
  });

  const exec = {
    orders: closedOrders.length,
    qty: 0,
    accepted: 0,
    defect: 0,
    defectPct: 0,
    time: 0,
  };

  const numbers = closedOrders.map((c) => c.orderNumber);
  let operators: Record<string, unknown>[] = [];
  let machines: Record<string, unknown>[] = [];

  if (numbers.length > 0) {
    const [orders, timeGroups] = await Promise.all([
      prisma.workOrders.findMany({
        where: { number: { in: numbers } },
        select: { number: true, qty: true, operator: true, machine: true },
      }),
      prisma.transitions.groupBy({
        by: ['orderNumber'],
        where: { orderNumber: { in: numbers } },
        _sum: { time: true },
      }),
    ]);

    const orderById = new Map(orders.map((o) => [o.number, o]));
    const timeById = new Map(timeGroups.map((g) => [g.orderNumber, g._sum.time ?? 0]));
    const opMap = new Map<string, GroupTotals>();
    const machineMap = new Map<string, GroupTotals>();

    for (const c of closedOrders) {
      const o = orderById.get(c.orderNumber);
      if (!o) continue;
      exec.qty += o.qty;
      exec.accepted += c.acceptedTotal;
      exec.defect += c.defectTotal;
      exec.time += timeById.get(c.orderNumber) ?? 0;

      const merge = (m: Map<string, GroupTotals>, key: string) => {
        const t = m.get(key) || { orders: 0, qty: 0, accepted: 0, defect: 0, time: 0 };
        t.orders += 1;
        t.qty += o.qty;
        t.accepted += c.acceptedTotal;
        t.defect += c.defectTotal;
        t.time += timeById.get(c.orderNumber) ?? 0;
        m.set(key, t);
      };
      merge(opMap, o.operator);
      merge(machineMap, o.machine);
    }

    exec.defectPct = defectPct(exec.accepted, exec.defect);

    operators = Array.from(opMap.entries())
      .map(([key, t]) => toGroupRow(t, key, 'operator'))
      .sort((a, b) => Number(b.orders) - Number(a.orders));
    machines = Array.from(machineMap.entries())
      .map(([key, t]) => toGroupRow(t, key, 'machine'))
      .sort((a, b) => Number(b.orders) - Number(a.orders));
  }

  exec.defectPct = defectPct(exec.accepted, exec.defect);

  return {
    summary: {
      launchesByStatus,
      ordersByStatus,
      paLoad,
      machinesBusy,
      machinesIdle,
    },
    nomenclature: { units },
    reports: {
      from: fmtDay(from),
      to: fmtDay(to),
      exec,
      operators,
      machines,
    },
  };
}
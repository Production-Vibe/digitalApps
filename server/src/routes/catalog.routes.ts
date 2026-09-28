import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { buildCatalogTree } from '../lib/catalog-tree';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { param, queryStr } from '../lib/request';
import { roundSmart } from '../lib/round';
import { computeNext, isPrefix, missingPathRows, topLevelNext } from '../lib/codes';
import { DICT_LABELS, isDictField, toCanonical } from '../lib/dict';

const router = Router();

const FLAG_FIELDS = ['cutting', 'heatTreatment', 'plasma', 'turning', 'milling', 'drilling', 'fitting', 'bending', 'coating'] as const;
const NUM_FIELDS = ['parentQty', 'wallThickness', 'cutLength', 'blankWeight', 'partWeight'] as const;
const STR_FIELDS = ['code', 'name', 'designation', 'designation2', 'blankType', 'material', 'materialGrade', 'blankSize', 'ppb', 'priority'] as const;

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  return ['+', '1', 'да'].includes(String(v).trim().toLowerCase());
}

function normalizeBody(body: unknown): Prisma.CatalogUncheckedCreateInput {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const f of STR_FIELDS) {
    const val = raw[f];
    data[f] = typeof val === 'string' ? val.trim() : String(val ?? '').trim();
  }
  for (const f of NUM_FIELDS) {
    const n = Number(raw[f] ?? 0);
    data[f] = roundSmart(Number.isFinite(n) ? n : 0);
  }
  for (const f of FLAG_FIELDS) data[f] = toBool(raw[f]);
  return data as Prisma.CatalogUncheckedCreateInput;
}

function isP2002(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: string }).code === 'P2002';
}

async function validateDictFields(data: Record<string, unknown>): Promise<string | null> {
  for (const f of STR_FIELDS) {
    if (!isDictField(f)) continue;
    const raw = data[f];
    if (!raw || String(raw).trim() === '') continue;
    const canon = await toCanonical(f, raw);
    if (canon === null) return f;
    if (canon) data[f] = canon;
  }
  return null;
}

function dictErrorBody(data: Record<string, unknown>, field: string): { error: string; field: string } | null {
  if (!isDictField(field)) return null;
  return {
    error: 'Значение «' + String(data[field] ?? '') + '» не в пределах ' + DICT_LABELS[field],
    field,
  };
}

async function allCodes(): Promise<string[]> {
  const rows = await prisma.catalog.findMany({ select: { code: true } });
  return rows.map((r) => r.code);
}

router.get('/', requireAuth('master', 'shift'), async (req, res) => {
  const search = queryStr(req, 'search');
  const priority = queryStr(req, 'priority');
  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (priority) {
    where.priority = priority;
  }
  const items = await prisma.catalog.findMany({
    where,
    orderBy: { code: 'asc' },
    ...(search || priority ? { take: 500 } : {}),
  });
  res.json(items);
});

router.post('/next-code', requireAuth('master'), async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const parent = String(body.parent ?? '').trim();
  const codes = await allCodes();
  if (parent) {
    if (!isPrefix(parent, codes)) {
      res.status(400).json({ error: 'Родитель «' + parent + '» отсутствует в дереве' });
      return;
    }
    const next = computeNext(parent, codes);
    res.json({ code: next, wouldMaterialize: missingPathRows(next, codes) });
    return;
  }
  res.json({ code: topLevelNext(codes), wouldMaterialize: [] });
});

router.post('/', requireAuth('master'), async (req: AuthRequest, res) => {
  const data = normalizeBody(req.body);
  const dictField = await validateDictFields(data as unknown as Record<string, unknown>);
  const dictErr = dictField ? dictErrorBody(data as unknown as Record<string, unknown>, dictField) : null;
  if (dictErr) { res.status(400).json(dictErr); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const parent = (body.parent || '').toString().trim();
  const role = req.user?.role ?? '';
  const materialized: string[] = [];
  if (role !== 'admin') {
    const codes = await allCodes();
    if (!parent) {
      const expected = topLevelNext(codes);
      if (data.code !== expected) {
        res.status(400).json({ error: 'Код позиции формируется автоматически', code: expected });
        return;
      }
    } else {
      if (!isPrefix(parent, codes)) {
        res.status(400).json({ error: 'Родитель «' + parent + '» отсутствует в дереве' });
        return;
      }
      const expected = computeNext(parent, codes);
      if (data.code !== expected) {
        res.status(400).json({ error: 'Код позиции формируется автоматически', code: expected });
        return;
      }
    }
    for (const m of missingPathRows(data.code, codes)) {
      await prisma.catalog.upsert({
        where: { code: m },
        update: {},
        create: {
          code: m,
          name: '',
          designation: '',
          designation2: '',
          parentQty: 0,
          blankType: '',
          material: '',
          materialGrade: '',
          blankSize: '',
          wallThickness: 0,
          cutLength: 0,
          ppb: '',
          blankWeight: 0,
          partWeight: 0,
          cutting: false,
          heatTreatment: false,
          plasma: false,
          turning: false,
          milling: false,
          drilling: false,
          fitting: false,
          bending: false,
          coating: false,
          priority: '',
        },
      });
      materialized.push(m);
    }
  }
  if (!data.code) { res.status(400).json({ error: 'Код обязателен' }); return; }
  const existing = await prisma.catalog.findUnique({ where: { code: data.code } });
  if (existing) { res.status(409).json({ error: 'Код уже существует' }); return; }
  try {
    const created = await prisma.catalog.create({ data });
    res.status(201).json(materialized.length ? { ...created, materialized } : created);
  } catch (e) {
    if (isP2002(e)) { res.status(409).json({ error: 'Код уже существует' }); return; }
    throw e;
  }
});

router.put('/:code', requireAuth('master'), async (req: AuthRequest, res) => {
  const oldCode = param(req, 'code');
  const existing = await prisma.catalog.findUnique({ where: { code: oldCode } });
  if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
  const data = normalizeBody(req.body);
  const dictField = await validateDictFields(data as unknown as Record<string, unknown>);
  const dictErr = dictField ? dictErrorBody(data as unknown as Record<string, unknown>, dictField) : null;
  if (dictErr) { res.status(400).json(dictErr); return; }
  const newCode = data.code || oldCode;
  if (newCode !== oldCode) {
    const role = req.user?.role ?? '';
    if (role !== 'admin') {
      res.status(400).json({ error: 'Код позиции формируется автоматически' });
      return;
    }
    const taken = await prisma.catalog.findUnique({ where: { code: newCode } });
    if (taken) { res.status(409).json({ error: 'Код уже существует' }); return; }
    const moved = await prisma.$transaction(async (tx) => {
      await tx.catalog.create({ data: { ...data, code: newCode } });
      const l = await tx.launches.updateMany({ where: { partCode: oldCode }, data: { partCode: newCode } });
      const w = await tx.workOrders.updateMany({ where: { partCode: oldCode }, data: { partCode: newCode } });
      const p = await tx.printQueue.updateMany({ where: { partCode: oldCode }, data: { partCode: newCode } });
      const q = await tx.queue.updateMany({ where: { code: oldCode }, data: { code: newCode } });
      await tx.catalog.delete({ where: { code: oldCode } });
      return { launches: l.count, workOrders: w.count, printQueue: p.count, queue: q.count };
    });
    const fresh = await prisma.catalog.findUnique({ where: { code: newCode } });
    res.json({ ...fresh, codeChanged: true, moved });
    return;
  }
  const updated = await prisma.catalog.update({
    where: { code: oldCode },
    data: data as Prisma.CatalogUncheckedUpdateInput,
  });
  res.json(updated);
});

router.delete('/:code', requireAuth('master'), async (req, res) => {
  const code = param(req, 'code');
  const existing = await prisma.catalog.findUnique({ where: { code } });
  if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
  const [launches, workOrders, printQueue, queue] = await Promise.all([
    prisma.launches.count({ where: { partCode: code } }),
    prisma.workOrders.count({ where: { partCode: code } }),
    prisma.printQueue.count({ where: { partCode: code } }),
    prisma.queue.count({ where: { code } }),
  ]);
  if (launches + workOrders + printQueue + queue > 0) {
    res.status(409).json({ error: 'Код используется', refs: { launches, workOrders, printQueue, queue } });
    return;
  }
  await prisma.catalog.delete({ where: { code } });
  res.json({ ok: true });
});

router.get('/:code', requireAuth('master', 'shift'), async (req, res) => {
  const item = await prisma.catalog.findUnique({ where: { code: param(req, 'code') } });
  if (!item) { res.status(404).json({ error: 'Не найдено' }); return; }
  res.json(item);
});

router.get('/tree/units', requireAuth('master', 'shift'), async (_req, res) => {
  const items = await prisma.catalog.findMany({
    select: { code: true, name: true, designation: true },
    orderBy: { code: 'asc' },
  });
  const tree = buildCatalogTree(items);
  res.json(tree);
});

export default router;

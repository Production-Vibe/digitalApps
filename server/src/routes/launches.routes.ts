import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { generateLaunchId } from '../lib/id';
import { param, queryStr } from '../lib/request';

const router = Router();

router.get('/', requireAuth('master', 'shift'), async (req, res) => {
  const status = queryStr(req, 'status');
  const pa = queryStr(req, 'pa');
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (pa) where.paNumber = { contains: pa };
  const launches = await prisma.launches.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json(launches);
});

router.get('/:id', requireAuth('master', 'shift'), async (req, res) => {
  const launch = await prisma.launches.findUnique({ where: { id: param(req, 'id') } });
  if (!launch) { res.status(404).json({ error: 'Не найдено' }); return; }
  res.json(launch);
});

router.post('/', requireAuth('master'), async (req, res) => {
  const { partCode, name, assembly, qty, paNumber, createdBy, launchType, reason, relatedLaunchId } = req.body;
  if (!partCode || !paNumber) { res.status(400).json({ error: 'Код детали и № ПА обязательны' }); return; }
  const launch = await prisma.launches.create({
    data: {
      id: generateLaunchId(),
      partCode,
      name: name || '',
      assembly: assembly || '',
      qty: Number(qty) || 0,
      paNumber,
      createdBy: createdBy || '',
      launchType: launchType || 'Основной',
      reason: reason || null,
      relatedLaunchId: relatedLaunchId || null,
    },
  });
  res.status(201).json(launch);
});

router.put('/:id', requireAuth('master'), async (req, res) => {
  const id = param(req, 'id');
  const existing = await prisma.launches.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
  if (existing.status !== 'to_launch') { res.status(400).json({ error: 'Можно менять только запуски со статусом "К запуску"' }); return; }
  const { qty, paNumber } = req.body;
  const update: Record<string, unknown> = {};
  if (qty !== undefined) update.qty = Number(qty);
  if (paNumber !== undefined) update.paNumber = paNumber;
  const launch = await prisma.launches.update({ where: { id }, data: update });
  res.json(launch);
});

router.delete('/:id', requireAuth('master'), async (req, res) => {
  const id = param(req, 'id');
  const existing = await prisma.launches.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
  await prisma.workOrders.deleteMany({ where: { launchId: id } });
  await prisma.launches.delete({ where: { id } });
  res.json({ ok: true });
});

router.get('/pa/occupied', requireAuth('master', 'shift'), async (_req, res) => {
  const launches = await prisma.launches.findMany({
    where: { status: { not: 'done' } },
    select: { paNumber: true, id: true, status: true },
  });
  const occupied = new Map<string, string[]>();
  for (const l of launches) {
    const paList = l.paNumber.split(/[,;\s]+/).map((s: string) => s.trim()).filter(Boolean);
    for (const pa of paList) {
      if (!occupied.has(pa)) occupied.set(pa, []);
      occupied.get(pa)!.push(l.id);
    }
  }
  res.json(Object.fromEntries(occupied));
});

export default router;

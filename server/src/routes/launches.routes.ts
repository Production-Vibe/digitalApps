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
  if (status) where.статус = status;
  if (pa) where.номерПА = { contains: pa };
  const launches = await prisma.launches.findMany({ where, orderBy: { дата: 'desc' }, take: 200 });
  res.json(launches);
});

router.get('/:id', requireAuth('master', 'shift'), async (req, res) => {
  const launch = await prisma.launches.findUnique({ where: { id: param(req, 'id') } });
  if (!launch) { res.status(404).json({ error: 'Не найдено' }); return; }
  res.json(launch);
});

router.post('/', requireAuth('master'), async (req, res) => {
  const { кодДетали, наименование, узел, колВо, номерПА, ктоСоздал, типЗапуска, причина, связанныйЗапуск } = req.body;
  if (!кодДетали || !номерПА) { res.status(400).json({ error: 'Код детали и № ПА обязательны' }); return; }
  const launch = await prisma.launches.create({
    data: {
      id: generateLaunchId(),
      кодДетали,
      наименование: наименование || '',
      узел: узел || '',
      колВо: Number(колВо) || 0,
      номерПА,
      ктоСоздал: ктоСоздал || '',
      типЗапуска: типЗапуска || 'Основной',
      причина: причина || null,
      связанныйЗапуск: связанныйЗапуск || null,
    },
  });
  res.status(201).json(launch);
});

router.put('/:id', requireAuth('master'), async (req, res) => {
  const id = param(req, 'id');
  const existing = await prisma.launches.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
  if (existing.статус !== 'К_запуску') { res.status(400).json({ error: 'Можно менять только запуски со статусом "К запуску"' }); return; }
  const { колВо, номерПА } = req.body;
  const update: Record<string, unknown> = {};
  if (колВо !== undefined) update.колВо = Number(колВо);
  if (номерПА !== undefined) update.номерПА = номерПА;
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
    where: { статус: { not: 'Готово' } },
    select: { номерПА: true, id: true, статус: true },
  });
  const occupied = new Map<string, string[]>();
  for (const l of launches) {
    const paList = l.номерПА.split(/[,;\s]+/).map((s: string) => s.trim()).filter(Boolean);
    for (const pa of paList) {
      if (!occupied.has(pa)) occupied.set(pa, []);
      occupied.get(pa)!.push(l.id);
    }
  }
  res.json(Object.fromEntries(occupied));
});

export default router;

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { param } from '../lib/request';

const router = Router();

const DEFAULT_MACHINES = ['ПА8', 'ПА9', 'ПА10', 'ПА11', 'ПА12'];

router.get('/', requireAuth('master', 'shift', 'operator'), async (_req, res) => {
  const items = await prisma.equipment.findMany({ orderBy: { название: 'asc' } });
  if (items.length === 0) {
    res.json(DEFAULT_MACHINES.map((н) => ({ id: 0, название: н })));
    return;
  }
  res.json(items);
});

router.post('/', requireAuth('master'), async (req, res) => {
  const { название } = req.body;
  if (!название) { res.status(400).json({ error: 'Название обязательно' }); return; }
  const item = await prisma.equipment.create({ data: { название } });
  res.status(201).json(item);
});

router.delete('/:id', requireAuth('master'), async (req, res) => {
  await prisma.equipment.delete({ where: { id: parseInt(param(req, 'id')) } });
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { generateShiftId } from '../lib/id';
import { param, queryStr } from '../lib/request';

const router = Router();

router.get('/active-operators', requireAuth('shift'), async (_req, res) => {
  const shifts = await prisma.shifts.findMany({
    where: { статус: 'open' },
    select: { оператор: true, станок: true, id: true },
  });
  res.json(shifts);
});

router.get('/my', requireAuth('operator'), async (req, res) => {
  const оператор = queryStr(req, 'оператор');
  if (!оператор) { res.status(400).json({ error: 'оператор обязателен' }); return; }
  const shifts = await prisma.shifts.findMany({
    where: { оператор },
    orderBy: { открыта: 'desc' },
    take: 20,
  });
  res.json(shifts);
});

router.post('/open', requireAuth('operator'), async (req, res) => {
  const { оператор, станок } = req.body;
  if (!оператор || !станок) { res.status(400).json({ error: 'оператор и станок обязательны' }); return; }

  const openShifts = await prisma.shifts.findMany({
    where: { оператор, статус: 'open' },
  });
  if (openShifts.length >= 2) {
    res.status(400).json({ error: 'Максимум 2 открытые смены' });
    return;
  }

  const occupied = await prisma.shifts.findFirst({
    where: { станок, статус: 'open', оператор: { not: оператор } },
  });
  if (occupied) {
    res.status(400).json({ error: `Станок ${станок} уже занят оператором ${occupied.оператор}` });
    return;
  }

  const shift = await prisma.shifts.create({
    data: { id: generateShiftId(), оператор, станок, статус: 'open' },
  });
  res.status(201).json(shift);
});

router.post('/close/:id', requireAuth('operator'), async (req, res) => {
  const id = param(req, 'id');
  const shift = await prisma.shifts.findUnique({ where: { id } });
  if (!shift) { res.status(404).json({ error: 'Смена не найдена' }); return; }
  if (shift.статус !== 'open') { res.status(400).json({ error: 'Смена уже закрыта' }); return; }
  const updated = await prisma.shifts.update({
    where: { id },
    data: { статус: 'closed', закрыта: new Date() },
  });
  res.json(updated);
});

export default router;

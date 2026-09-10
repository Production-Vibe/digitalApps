import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { generateShiftId } from '../lib/id';
import { param, queryStr } from '../lib/request';

const router = Router();

router.get('/active-operators', requireAuth('shift'), async (_req, res) => {
  const shifts = await prisma.shifts.findMany({
    where: { status: 'open' },
    select: { operator: true, machine: true, id: true },
  });
  res.json(shifts);
});

router.get('/my', requireAuth('operator'), async (req, res) => {
  const operator = queryStr(req, 'operator');
  if (!operator) { res.status(400).json({ error: 'operator обязателен' }); return; }
  const shifts = await prisma.shifts.findMany({
    where: { operator },
    orderBy: { openedAt: 'desc' },
    take: 20,
  });
  res.json(shifts);
});

router.post('/open', requireAuth('operator'), async (req, res) => {
  const { operator, machine } = req.body;
  if (!operator || !machine) { res.status(400).json({ error: 'operator и machine обязательны' }); return; }

  const openShifts = await prisma.shifts.findMany({
    where: { operator, status: 'open' },
  });
  if (openShifts.length >= 2) {
    res.status(400).json({ error: 'Максимум 2 открытые смены' });
    return;
  }

  const occupied = await prisma.shifts.findFirst({
    where: { machine, status: 'open', operator: { not: operator } },
  });
  if (occupied) {
    res.status(400).json({ error: `Станок ${machine} уже занят оператором ${occupied.operator}` });
    return;
  }

  const shift = await prisma.shifts.create({
    data: { id: generateShiftId(), operator, machine, status: 'open' },
  });
  res.status(201).json(shift);
});

router.post('/close/:id', requireAuth('operator'), async (req, res) => {
  const id = param(req, 'id');
  const shift = await prisma.shifts.findUnique({ where: { id } });
  if (!shift) { res.status(404).json({ error: 'Смена не найдена' }); return; }
  if (shift.status !== 'open') { res.status(400).json({ error: 'Смена уже закрыта' }); return; }
  const updated = await prisma.shifts.update({
    where: { id },
    data: { status: 'closed', closedAt: new Date() },
  });
  res.json(updated);
});

export default router;

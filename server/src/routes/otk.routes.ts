import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { param } from '../lib/request';

const router = Router();

router.get('/queue', requireAuth('otk'), async (_req, res) => {
  const orders = await prisma.workOrders.findMany({
    where: { status: { in: ['waiting_otk', 'rework'] } },
    orderBy: { number: 'desc' },
  });

  const orderNumbers = orders.map((o) => o.number);
  const transitions = await prisma.transitions.findMany({
    where: { orderNumber: { in: orderNumbers } },
    orderBy: { number: 'asc' },
  });

  const aggregates = new Map<string, { transitionCount: number; checkedCount: number; totalAccepted: number; totalDefect: number }>();
  for (const t of transitions) {
    if (!aggregates.has(t.orderNumber)) {
      aggregates.set(t.orderNumber, { transitionCount: 0, checkedCount: 0, totalAccepted: 0, totalDefect: 0 });
    }
    const agg = aggregates.get(t.orderNumber)!;
    agg.transitionCount++;
    if (t.status === 'checked') {
      agg.checkedCount++;
      agg.totalAccepted += t.accepted || 0;
      agg.totalDefect += t.defect || 0;
    }
  }

  const result = orders.map((o) => ({
    ...o,
    aggregates: aggregates.get(o.number) || { transitionCount: 0, checkedCount: 0, totalAccepted: 0, totalDefect: 0 },
  }));

  res.json(result);
});

router.get('/naryad/:number', requireAuth('otk'), async (req, res) => {
  const number = param(req, 'number');
  const order = await prisma.workOrders.findUnique({ where: { number } });
  if (!order) { res.status(404).json({ error: 'Наряд не найден' }); return; }

  const transitions = await prisma.transitions.findMany({
    where: { orderNumber: number },
    orderBy: { number: 'asc' },
  });

  const closingInfo = await prisma.closedOrders.findFirst({
    where: { orderNumber: number },
    orderBy: { closedAt: 'desc' },
  });

  res.json({ order, transitions, closingInfo });
});

router.post('/close', requireAuth('otk'), async (req, res) => {
  const { orderNumber, defectReason, comment, closedBy } = req.body;
  if (!orderNumber) { res.status(400).json({ error: 'orderNumber обязателен' }); return; }

  const order = await prisma.workOrders.findUnique({ where: { number: orderNumber } });
  if (!order) { res.status(404).json({ error: 'Наряд не найден' }); return; }

  if (order.status !== 'rework') {
    const transitions = await prisma.transitions.findMany({ where: { orderNumber } });
    const hasChecked = transitions.some((t) => t.status === 'checked');
    if (!hasChecked) {
      res.status(400).json({ error: 'Нельзя закрыть без проверенных переходов' });
      return;
    }
  }

  const transitions = await prisma.transitions.findMany({ where: { orderNumber } });
  const totalAccepted = transitions.reduce((sum, t) => sum + (t.accepted || 0), 0);
  const totalDefect = transitions.reduce((sum, t) => sum + (t.defect || 0), 0);

  await prisma.closedOrders.create({
    data: {
      orderNumber,
      acceptedTotal: totalAccepted,
      defectTotal: totalDefect,
      defectReason: defectReason || null,
      comment: comment || null,
      closedBy: closedBy || '',
    },
  });

  await prisma.workOrders.update({
    where: { number: orderNumber },
    data: { status: 'closed' },
  });

  res.json({ ok: true, totalAccepted, totalDefect });
});

router.post('/rework', requireAuth('otk'), async (req, res) => {
  const { orderNumber, reworkReason, closedBy } = req.body;
  if (!orderNumber) { res.status(400).json({ error: 'orderNumber обязателен' }); return; }

  const order = await prisma.workOrders.findUnique({ where: { number: orderNumber } });
  if (!order) { res.status(404).json({ error: 'Наряд не найден' }); return; }

  await prisma.workOrders.update({
    where: { number: orderNumber },
    data: { status: 'rework', reworkReason: reworkReason || null },
  });

  res.json({ ok: true });
});

router.get('/closing-info/:number', requireAuth('otk'), async (req, res) => {
  const info = await prisma.closedOrders.findFirst({
    where: { orderNumber: param(req, 'number') },
    orderBy: { closedAt: 'desc' },
  });
  if (!info) { res.status(404).json({ error: 'Информация о закрытии не найдена' }); return; }
  res.json(info);
});

export default router;
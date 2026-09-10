import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { param } from '../lib/request';

const router = Router();

router.get('/queue', requireAuth('otk'), async (_req, res) => {
  const orders = await prisma.workOrders.findMany({
    where: { статус: { in: ['waiting_otk', 'rework'] } },
    orderBy: { номер: 'desc' },
  });

  const naryadNomers = orders.map((o) => o.номер);
  const transitions = await prisma.transitions.findMany({
    where: { naryadNomer: { in: naryadNomers } },
    orderBy: { nomer: 'asc' },
  });

  const aggregates = new Map<string, { transitionCount: number; checkedCount: number; totalAccepted: number; totalDefect: number }>();
  for (const t of transitions) {
    if (!aggregates.has(t.naryadNomer)) {
      aggregates.set(t.naryadNomer, { transitionCount: 0, checkedCount: 0, totalAccepted: 0, totalDefect: 0 });
    }
    const agg = aggregates.get(t.naryadNomer)!;
    agg.transitionCount++;
    if (t.статус === 'checked') {
      agg.checkedCount++;
      agg.totalAccepted += t.принято || 0;
      agg.totalDefect += t.брак || 0;
    }
  }

  const result = orders.map((o) => ({
    ...o,
    aggregates: aggregates.get(o.номер) || { transitionCount: 0, checkedCount: 0, totalAccepted: 0, totalDefect: 0 },
  }));

  res.json(result);
});

router.get('/naryad/:номер', requireAuth('otk'), async (req, res) => {
  const номер = param(req, 'номер');
  const order = await prisma.workOrders.findUnique({ where: { номер } });
  if (!order) { res.status(404).json({ error: 'Наряд не найден' }); return; }

  const transitions = await prisma.transitions.findMany({
    where: { naryadNomer: номер },
    orderBy: { nomer: 'asc' },
  });

  const closingInfo = await prisma.closedOrders.findFirst({
    where: { naryadNomer: номер },
    orderBy: { дата: 'desc' },
  });

  res.json({ order, transitions, closingInfo });
});

router.post('/close', requireAuth('otk'), async (req, res) => {
  const { naryadNomer, причинаБрака, комментарий, кемЗакрыт } = req.body;
  if (!naryadNomer) { res.status(400).json({ error: 'naryadNomer обязателен' }); return; }

  const order = await prisma.workOrders.findUnique({ where: { номер: naryadNomer } });
  if (!order) { res.status(404).json({ error: 'Наряд не найден' }); return; }

  if (order.статус !== 'rework') {
    const transitions = await prisma.transitions.findMany({ where: { naryadNomer } });
    const hasChecked = transitions.some((t) => t.статус === 'checked');
    if (!hasChecked) {
      res.status(400).json({ error: 'Нельзя закрыть без проверенных переходов' });
      return;
    }
  }

  const transitions = await prisma.transitions.findMany({ where: { naryadNomer } });
  const totalAccepted = transitions.reduce((sum, t) => sum + (t.принято || 0), 0);
  const totalDefect = transitions.reduce((sum, t) => sum + (t.брак || 0), 0);

  await prisma.closedOrders.create({
    data: {
      naryadNomer,
      принятоеВсего: totalAccepted,
      бракВсего: totalDefect,
      причинаБрака: причинаБрака || null,
      комментарий: комментарий || null,
      кемЗакрыт: кемЗакрыт || '',
    },
  });

  await prisma.workOrders.update({
    where: { номер: naryadNomer },
    data: { статус: 'closed' },
  });

  res.json({ ok: true, totalAccepted, totalDefect });
});

router.post('/rework', requireAuth('otk'), async (req, res) => {
  const { naryadNomer, причинаДоработки, кемЗакрыт } = req.body;
  if (!naryadNomer) { res.status(400).json({ error: 'naryadNomer обязателен' }); return; }

  const order = await prisma.workOrders.findUnique({ where: { номер: naryadNomer } });
  if (!order) { res.status(404).json({ error: 'Наряд не найден' }); return; }

  await prisma.workOrders.update({
    where: { номер: naryadNomer },
    data: { статус: 'rework', причинаДоработки: причинаДоработки || null },
  });

  res.json({ ok: true });
});

router.get('/closing-info/:номер', requireAuth('otk'), async (req, res) => {
  const info = await prisma.closedOrders.findFirst({
    where: { naryadNomer: param(req, 'номер') },
    orderBy: { дата: 'desc' },
  });
  if (!info) { res.status(404).json({ error: 'Информация о закрытии не найдена' }); return; }
  res.json(info);
});

export default router;

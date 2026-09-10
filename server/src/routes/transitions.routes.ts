import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { generateTransitionNumber } from '../lib/id';
import { queryStr } from '../lib/request';
import { updateNaryadStatus } from '../lib/transition-logic';

const router = Router();

router.get('/', requireAuth('operator', 'otk'), async (req, res) => {
  const orderNumber = queryStr(req, 'orderNumber');
  const where: Record<string, unknown> = {};
  if (orderNumber) where.orderNumber = orderNumber;
  const transitions = await prisma.transitions.findMany({ where, orderBy: { number: 'asc' } });
  res.json(transitions);
});

router.post('/', requireAuth('operator'), async (req, res) => {
  const { orderNumber, description, operator, time, melt, machine, qty } = req.body;
  if (!orderNumber || !description || !operator || !machine) {
    res.status(400).json({ error: 'Обязательны: orderNumber, description, operator, machine' });
    return;
  }

  const number = await generateTransitionNumber(prisma as never, orderNumber);

  const transition = await prisma.transitions.create({
    data: {
      orderNumber,
      number,
      description,
      operator,
      time: Number(time) || 0,
      melt: melt || null,
      machine,
      qty: Number(qty) || 0,
      status: 'completed',
    },
  });

  await updateNaryadStatus(orderNumber);

  res.status(201).json(transition);
});

router.post('/complete', requireAuth('operator'), async (req, res) => {
  const { id } = req.body;
  if (!id) { res.status(400).json({ error: 'id обязателен' }); return; }
  const transition = await prisma.transitions.update({
    where: { id },
    data: { status: 'completed' },
  });
  await updateNaryadStatus(transition.orderNumber);
  res.json(transition);
});

router.post('/check', requireAuth('otk'), async (req, res) => {
  const { id, accepted, defect } = req.body;
  if (!id) { res.status(400).json({ error: 'id обязателен' }); return; }

  const transition = await prisma.transitions.findUnique({ where: { id } });
  if (!transition) { res.status(404).json({ error: 'Переход не найден' }); return; }

  const order = await prisma.workOrders.findUnique({ where: { number: transition.orderNumber } });
  if (!order) { res.status(404).json({ error: 'Наряд не найден' }); return; }

  const acceptedQty = Number(accepted) || 0;
  const defectQty = Number(defect) || 0;
  if (acceptedQty + defectQty > order.qty) {
    res.status(400).json({ error: `Принято+Брак (${acceptedQty + defectQty}) превышает количество наряда (${order.qty})` });
    return;
  }

  const updated = await prisma.transitions.update({
    where: { id },
    data: { status: 'checked', accepted: acceptedQty, defect: defectQty },
  });

  await updateNaryadStatus(transition.orderNumber);

  res.json(updated);
});

export default router;
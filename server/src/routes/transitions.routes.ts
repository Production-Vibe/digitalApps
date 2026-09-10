import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { generateTransitionNumber } from '../lib/id';
import { queryStr } from '../lib/request';

const router = Router();

router.get('/', requireAuth('operator', 'otk'), async (req, res) => {
  const naryadNomer = queryStr(req, 'naryadNomer');
  const where: Record<string, unknown> = {};
  if (naryadNomer) where.naryadNomer = naryadNomer;
  const transitions = await prisma.transitions.findMany({ where, orderBy: { nomer: 'asc' } });
  res.json(transitions);
});

router.post('/', requireAuth('operator'), async (req, res) => {
  const { naryadNomer, описание, оператор, время, плавка, станок, колВо } = req.body;
  if (!naryadNomer || !описание || !оператор || !станок) {
    res.status(400).json({ error: 'Обязательны: naryadNomer, описание, оператор, станок' });
    return;
  }

  const nomer = await generateTransitionNumber(prisma as never, naryadNomer);

  const transition = await prisma.transitions.create({
    data: {
      naryadNomer,
      nomer,
      описание,
      оператор,
      время: Number(время) || 0,
      плавка: плавка || null,
      станок,
      колВо: Number(колВо) || 0,
      статус: 'completed',
    },
  });

  await updateNaryadStatus(naryadNomer);

  res.status(201).json(transition);
});

router.post('/complete', requireAuth('operator'), async (req, res) => {
  const { id } = req.body;
  if (!id) { res.status(400).json({ error: 'id обязателен' }); return; }
  const transition = await prisma.transitions.update({
    where: { id },
    data: { статус: 'completed' },
  });
  await updateNaryadStatus(transition.naryadNomer);
  res.json(transition);
});

router.post('/check', requireAuth('otk'), async (req, res) => {
  const { id, accepted, defect } = req.body;
  if (!id) { res.status(400).json({ error: 'id обязателен' }); return; }

  const transition = await prisma.transitions.findUnique({ where: { id } });
  if (!transition) { res.status(404).json({ error: 'Переход не найден' }); return; }

  const order = await prisma.workOrders.findUnique({ where: { номер: transition.naryadNomer } });
  if (!order) { res.status(404).json({ error: 'Наряд не найден' }); return; }

  const acceptedQty = Number(accepted) || 0;
  const defectQty = Number(defect) || 0;
  if (acceptedQty + defectQty > order.колВо) {
    res.status(400).json({ error: `Принято+Брак (${acceptedQty + defectQty}) превышает количество наряда (${order.колВо})` });
    return;
  }

  const updated = await prisma.transitions.update({
    where: { id },
    data: { статус: 'checked', принято: acceptedQty, брак: defectQty },
  });

  await updateNaryadStatus(transition.naryadNomer);

  res.json(updated);
});

async function updateNaryadStatus(naryadNomer: string) {
  const transitions = await prisma.transitions.findMany({ where: { naryadNomer } });
  const order = await prisma.workOrders.findUnique({ where: { номер: naryadNomer } });
  if (!order || order.статус === 'closed') return;

  const hasInProgress = transitions.some((t) => t.статус === 'in_progress');
  const allCompleted = transitions.every((t) => t.статус === 'completed' || t.статус === 'checked');

  let newStatus = order.статус;
  if (hasInProgress) {
    newStatus = 'in_progress';
  } else if (allCompleted && transitions.length > 0) {
    newStatus = 'waiting_otk';
  } else {
    newStatus = 'in_progress';
  }

  if (newStatus !== order.статус) {
    await prisma.workOrders.update({ where: { номер: naryadNomer }, data: { статус: newStatus } });
  }
}

export default router;

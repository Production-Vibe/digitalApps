import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { generateNaryadId } from '../lib/id';
import { param, queryStr } from '../lib/request';

const router = Router();

router.get('/', requireAuth('master', 'shift', 'operator', 'otk'), async (req, res) => {
  const launchId = queryStr(req, 'launchId');
  const status = queryStr(req, 'status');
  const operator = queryStr(req, 'operator');
  const where: Record<string, unknown> = {};
  if (launchId) where.launchId = launchId;
  if (status) where.status = status;
  if (operator) where.operator = operator;
  const orders = await prisma.workOrders.findMany({ where, orderBy: { number: 'desc' }, take: 200 });
  res.json(orders);
});

router.get('/:number', requireAuth('master', 'shift', 'operator', 'otk'), async (req, res) => {
  const order = await prisma.workOrders.findUnique({ where: { number: param(req, 'number') } });
  if (!order) { res.status(404).json({ error: 'Не найдено' }); return; }
  res.json(order);
});

router.post('/issue', requireAuth('shift'), async (req, res) => {
  const { launchId, partCode, name, designation, assembly, operator, machine, qty } = req.body;
  if (!partCode || !operator || !machine || !qty) {
    res.status(400).json({ error: 'Обязательны: partCode, operator, machine, qty' });
    return;
  }

  const number = generateNaryadId();

  const order = await prisma.workOrders.create({
    data: {
      number,
      partCode,
      name: name || '',
      designation: designation || '',
      assembly: assembly || '',
      operator,
      machine,
      qty: Number(qty),
      status: 'created',
      launchId: launchId || null,
    },
  });

  await prisma.printQueue.create({
    data: {
      orderNumber: number,
      partCode,
      name: name || '',
      designation: designation || '',
      assembly: assembly || '',
      operator,
      machine,
      qty: Number(qty),
    },
  });

  if (launchId) {
    const launch = await prisma.launches.findUnique({ where: { id: launchId } });
    if (launch && launch.status === 'to_launch') {
      await prisma.launches.update({ where: { id: launchId }, data: { status: 'issued' } });
    }
  }

  res.status(201).json(order);
});

router.get('/my/list', requireAuth('operator'), async (req, res) => {
  const operator = queryStr(req, 'operator');
  if (!operator) { res.status(400).json({ error: 'operator обязателен' }); return; }
  const orders = await prisma.workOrders.findMany({
    where: { operator, status: { in: ['created', 'in_progress'] } },
    orderBy: { number: 'desc' },
  });
  res.json(orders);
});

router.get('/my/closed', requireAuth('operator'), async (req, res) => {
  const operator = queryStr(req, 'operator');
  if (!operator) { res.status(400).json({ error: 'operator обязателен' }); return; }
  const orders = await prisma.workOrders.findMany({
    where: { operator, status: 'closed' },
    orderBy: { number: 'desc' },
    take: 50,
  });
  res.json(orders);
});

router.put('/:number/status', requireAuth('operator'), async (req, res) => {
  const { status } = req.body;
  if (!status) { res.status(400).json({ error: 'status обязателен' }); return; }
  const order = await prisma.workOrders.update({
    where: { number: param(req, 'number') },
    data: { status },
  });
  res.json(order);
});

export default router;

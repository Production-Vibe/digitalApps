import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { generateNaryadId } from '../lib/id';
import { param, queryStr } from '../lib/request';

const router = Router();

router.get('/', requireAuth('master', 'shift', 'operator', 'otk'), async (req, res) => {
  const launchId = queryStr(req, 'launchId');
  const статус = queryStr(req, 'статус');
  const оператор = queryStr(req, 'оператор');
  const where: Record<string, unknown> = {};
  if (launchId) where.launchId = launchId;
  if (статус) where.статус = статус;
  if (оператор) where.оператор = оператор;
  const orders = await prisma.workOrders.findMany({ where, orderBy: { номер: 'desc' }, take: 200 });
  res.json(orders);
});

router.get('/:номер', requireAuth('master', 'shift', 'operator', 'otk'), async (req, res) => {
  const order = await prisma.workOrders.findUnique({ where: { номер: param(req, 'номер') } });
  if (!order) { res.status(404).json({ error: 'Не найдено' }); return; }
  res.json(order);
});

router.post('/issue', requireAuth('shift'), async (req, res) => {
  const { launchId, кодДетали, наименование, обозначение, узел, оператор, станок, колВо } = req.body;
  if (!кодДетали || !оператор || !станок || !колВо) {
    res.status(400).json({ error: 'Обязательны: кодДетали, оператор, станок, колВо' });
    return;
  }

  const номер = generateNaryadId();

  const order = await prisma.workOrders.create({
    data: {
      номер,
      кодДетали,
      наименование: наименование || '',
      обозначение: обозначение || '',
      узел: узел || '',
      оператор,
      станок,
      колВо: Number(колВо),
      статус: 'created',
      launchId: launchId || null,
    },
  });

  await prisma.printQueue.create({
    data: {
      naryadNomer: номер,
      кодДетали,
      наименование: наименование || '',
      обозначение: обозначение || '',
      узел: узел || '',
      оператор,
      станок,
      колВо: Number(колВо),
    },
  });

  if (launchId) {
    const launch = await prisma.launches.findUnique({ where: { id: launchId } });
    if (launch && launch.статус === 'К_запуску') {
      await prisma.launches.update({ where: { id: launchId }, data: { статус: 'Выдано' } });
    }
  }

  res.status(201).json(order);
});

router.get('/my/list', requireAuth('operator'), async (req, res) => {
  const оператор = queryStr(req, 'оператор');
  if (!оператор) { res.status(400).json({ error: 'оператор обязателен' }); return; }
  const orders = await prisma.workOrders.findMany({
    where: { оператор, статус: { in: ['created', 'in_progress'] } },
    orderBy: { номер: 'desc' },
  });
  res.json(orders);
});

router.get('/my/closed', requireAuth('operator'), async (req, res) => {
  const оператор = queryStr(req, 'оператор');
  if (!оператор) { res.status(400).json({ error: 'оператор обязателен' }); return; }
  const orders = await prisma.workOrders.findMany({
    where: { оператор, статус: 'closed' },
    orderBy: { номер: 'desc' },
    take: 50,
  });
  res.json(orders);
});

router.put('/:номер/status', requireAuth('operator'), async (req, res) => {
  const { статус } = req.body;
  if (!статус) { res.status(400).json({ error: 'статус обязателен' }); return; }
  const order = await prisma.workOrders.update({
    where: { номер: param(req, 'номер') },
    data: { статус },
  });
  res.json(order);
});

export default router;

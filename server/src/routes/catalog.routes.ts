import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { buildCatalogTree } from '../lib/catalog-tree';
import { requireAuth } from '../middleware/auth';
import { param, queryStr } from '../lib/request';

const router = Router();

router.get('/', requireAuth('master', 'shift'), async (req, res) => {
  const search = queryStr(req, 'search');
  const priority = queryStr(req, 'priority');
  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (priority) {
    where.priority = priority;
  }
  const items = await prisma.catalog.findMany({ where, orderBy: { code: 'asc' }, take: 500 });
  res.json(items);
});

router.get('/:code', requireAuth('master', 'shift'), async (req, res) => {
  const item = await prisma.catalog.findUnique({ where: { code: param(req, 'code') } });
  if (!item) { res.status(404).json({ error: 'Не найдено' }); return; }
  res.json(item);
});

router.get('/tree/units', requireAuth('master', 'shift'), async (_req, res) => {
  const items = await prisma.catalog.findMany({
    select: { code: true, name: true, designation: true },
    orderBy: { code: 'asc' },
  });
  const units = buildCatalogTree(items);
  res.json(Object.fromEntries(units.map((u) => [u.unit, u.items])));
});

export default router;

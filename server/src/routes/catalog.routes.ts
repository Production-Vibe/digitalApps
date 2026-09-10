import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { param, queryStr } from '../lib/request';

const router = Router();

router.get('/', requireAuth('master', 'shift'), async (req, res) => {
  const search = queryStr(req, 'search');
  const priority = queryStr(req, 'priority');
  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { код: { contains: search, mode: 'insensitive' } },
      { наименование: { contains: search, mode: 'insensitive' } },
      { обозначение: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (priority) {
    where.приоритет = priority;
  }
  const items = await prisma.catalog.findMany({ where, orderBy: { код: 'asc' }, take: 500 });
  res.json(items);
});

router.get('/:код', requireAuth('master', 'shift'), async (req, res) => {
  const item = await prisma.catalog.findUnique({ where: { код: param(req, 'код') } });
  if (!item) { res.status(404).json({ error: 'Не найдено' }); return; }
  res.json(item);
});

router.get('/tree/units', requireAuth('master', 'shift'), async (_req, res) => {
  const items = await prisma.catalog.findMany({ orderBy: { код: 'asc' } });
  const units = new Map<string, { код: string; наименование: string; обозначение: string }[]>();
  for (const item of items) {
    const key = item.обозначение.split('-')[0] || 'Без узла';
    if (!units.has(key)) units.set(key, []);
    units.get(key)!.push({ код: item.код, наименование: item.наименование, обозначение: item.обозначение });
  }
  res.json(Object.fromEntries(units));
});

export default router;

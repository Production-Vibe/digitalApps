import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { queryStr } from '../lib/request';
const router = Router();

const TYPE_ORDER = ['Чертёж КД', 'Маршрутная карта', 'Карта наладки', 'Эскиз'];

router.get('/', requireAuth('master', 'shift'), async (req, res) => {
  const partCode = queryStr(req, 'partCode');
  if (!partCode) {
    res.status(400).json({ error: 'Не указан partCode' });
    return;
  }
  const links = await prisma.productDocLink.findMany({
    where: { partCode },
    include: { doc: true, part: { select: { code: true, name: true, designation: true } } },
    orderBy: [{ doc: { type: 'asc' } }],
  });

  const part = links.length > 0
    ? links[0].part
    : await prisma.catalog.findUnique({
        where: { code: partCode },
        select: { code: true, name: true, designation: true },
      });

  const docIds = [...new Set(links.map((link) => link.docId))];
  const allLinks = docIds.length > 0
    ? await prisma.productDocLink.findMany({
        where: { docId: { in: docIds } },
        include: { part: { select: { code: true, name: true, designation: true } } },
        orderBy: { partCode: 'asc' },
      })
    : [];
  const partsByDoc = new Map<string, { code: string; name: string; designation: string }[]>();
  for (const link of allLinks) {
    const list = partsByDoc.get(link.docId) ?? [];
    list.push(link.part);
    partsByDoc.set(link.docId, list);
  }

  const byType = new Map<string, { type: string; docs: typeof links }>();
  for (const link of links) {
    const group = byType.get(link.doc.type) ?? { type: link.doc.type, docs: [] };
    group.docs.push(link);
    byType.set(link.doc.type, group);
  }

  const groups = [...byType.values()]
    .sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type);
      const bi = TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.type.localeCompare(b.type, 'ru');
    })
    .map((group) => ({
      type: group.type,
      docs: group.docs.map((link) => ({
        id: link.doc.id,
        file: link.doc.file,
        path: link.doc.path,
        status: link.doc.status,
        parts: partsByDoc.get(link.docId) ?? [],
      })),
    }));

  res.json({ partCode, part, total: links.length, groups });
});

router.get('/counts', requireAuth('master', 'shift'), async (_req, res) => {
  const links = await prisma.productDocLink.findMany({
    select: { partCode: true, docId: true },
  });
  const counts: Record<string, number> = {};
  for (const link of links) {
    counts[link.partCode] = (counts[link.partCode] ?? 0) + 1;
  }
  res.json(counts);
});

export default router;

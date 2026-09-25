import express, { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { param, queryStr } from '../lib/request';
import { DICT_TYPES, DICT_LABELS, normalizeDictValue, listActive, isDictField, DictType } from '../lib/dict';

const router = Router();

function paramDictType(req: express.Request, res: express.Response): DictType | null {
  const t = param(req, 'type');
  if (!isDictField(t)) { res.status(400).json({ error: 'Неизвестный тип справочника' }); return null; }
  return t;
}

router.get('/:type', requireAuth('master'), async (req: AuthRequest, res) => {
  const t = paramDictType(req, res);
  if (!t) return;
  if (queryStr(req, 'all') === '1' && req.user?.role === 'admin') {
    const items = await prisma.dictionaryValue.findMany({
      where: { type: t },
      orderBy: [{ sort: 'asc' }, { value: 'asc' }],
    });
    res.json(items);
    return;
  }
  res.json(await listActive(t));
});

router.post('/:type', requireAuth('master'), async (req, res) => {
  const t = paramDictType(req, res);
  if (!t) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const value = normalizeDictValue(body.value);
  if (!value) { res.status(400).json({ error: 'Пустое значение' }); return; }

  const existing = await prisma.dictionaryValue.findFirst({ where: { type: t, value } });
  if (existing) {
    if (existing.isActive) { res.status(409).json({ error: 'Значение уже есть в справочнике' }); return; }
    const reactivated = await prisma.dictionaryValue.update({ where: { id: existing.id }, data: { isActive: true } });
    res.status(201).json({ ok: true, reactivated: true, id: reactivated.id });
    return;
  }

  const created = await prisma.dictionaryValue.create({
    data: { type: t, value, synonyms: [], sort: 0 },
  });
  res.status(201).json({ ok: true, id: created.id });
});

router.put('/:type/:id', requireAuth('admin'), async (req, res) => {
  const t = paramDictType(req, res);
  if (!t) return;
  const id = Number(param(req, 'id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный идентификатор' });
    return;
  }

  const existing = await prisma.dictionaryValue.findFirst({ where: { id, type: t } });
  if (!existing) { res.status(404).json({ error: 'Запись не найдена' }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const data: { value?: string; synonyms?: string[]; sort?: number } = {};

  if (body.value !== undefined) {
    const value = normalizeDictValue(body.value);
    if (value) {
      const duplicate = await prisma.dictionaryValue.findFirst({
        where: { type: t, value, NOT: { id } },
      });
      if (duplicate) { res.status(409).json({ error: 'Значение уже есть в справочнике' }); return; }
      data.value = value;
    }
  }

  if (Array.isArray(body.synonyms) && body.synonyms.every((item) => typeof item === 'string')) {
    data.synonyms = body.synonyms.map((item) => normalizeDictValue(item));
  }
  if (typeof body.sort === 'number' && Number.isFinite(body.sort)) data.sort = body.sort;

  await prisma.dictionaryValue.update({ where: { id: existing.id }, data });
  res.json({ ok: true });
});

router.post('/:type/:id/deactivate', requireAuth('admin'), async (req, res) => {
  const t = paramDictType(req, res);
  if (!t) return;
  const id = Number(param(req, 'id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный идентификатор' });
    return;
  }

  const existing = await prisma.dictionaryValue.findFirst({ where: { id, type: t } });
  if (!existing) { res.status(404).json({ error: 'Запись не найдена' }); return; }
  await prisma.dictionaryValue.update({ where: { id: existing.id }, data: { isActive: false } });
  res.json({ ok: true });
});

export default router;

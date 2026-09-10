import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { generateTransitionNumber } from '../lib/id';
import { updateNaryadStatus } from '../lib/transition-logic';

const router = Router();

function checkSecret(req: Request, res: Response): boolean {
  const secret = req.headers['x-vba-secret'];
  if (!secret || secret !== config.vbaSecret) {
    res.status(401).json({ error: 'Неверный X-VBA-Secret' });
    return false;
  }
  return true;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toUpperCase();
  return s === '+' || s === '1' || s === 'ДА';
}

async function handleUploadCatalog(payload: Record<string, unknown>) {
  const rows = payload.rows as Record<string, unknown>[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('rows обязателен (массив объектов)');
  }
  let count = 0;
  for (const r of rows) {
    await prisma.catalog.upsert({
      where: { код: String(r['Код'] || '') },
      update: {},
      create: {
        код: String(r['Код'] || ''),
        наименование: String(r['Наименование'] || ''),
        обозначение: String(r['Обозначение'] || ''),
        обозначение2: String(r['Обозначение 2'] || ''),
        колНаРодителя: Number(r['Кол-во на родителя'] || 0),
        типЗаготовки: String(r['Тип заготовки'] || ''),
        материал: String(r['Материал'] || ''),
        маркаМатериала: String(r['Марка материала'] || ''),
        размерЗаготовки: String(r['Размер заготовки'] || ''),
        толщинаСтенки: Number(r['Толщина стенки'] || 0),
        длинаРезки: Number(r['Длина резки'] || 0),
        ппб: String(r['ППБ'] || ''),
        массаЗаготовки: Number(r['Масса заготовки'] || 0),
        массаДетали: Number(r['Масса детали'] || 0),
        резка: toBool(r['Резка']),
        термообработка: toBool(r['Термообработка']),
        плазма: toBool(r['Плазма']),
        токарная: toBool(r['Токарная']),
        фрезерная: toBool(r['Фрезерная']),
        сверлильная: toBool(r['Сверлильная']),
        слесарная: toBool(r['Слесарная']),
        гибка: toBool(r['Гибка']),
        покрытие: toBool(r['Покрытие']),
        приоритет: String(r['Приоритет'] || ''),
      },
    });
    count++;
  }
  return { ok: true, inserted: count };
}

async function handleCreateTransition(payload: Record<string, unknown>) {
  const { naryadNomer, описание, оператор, время, плавка, станок, колВо } = payload;
  if (!naryadNomer || !описание || !станок) {
    throw new Error('Обязательны: naryadNomer, описание, станок');
  }
  const nomer = await generateTransitionNumber(prisma as never, String(naryadNomer));
  const transition = await prisma.transitions.create({
    data: {
      naryadNomer: String(naryadNomer),
      nomer,
      описание: String(описание),
      оператор: String(оператор || ''),
      время: Number(время || 0),
      плавка: плавка ? String(плавка) : null,
      станок: String(станок),
      колВо: Number(колВо || 0),
      статус: 'in_progress',
    },
  });
  return { ok: true, transition };
}

async function handleCompleteTransition(payload: Record<string, unknown>) {
  const { id } = payload;
  if (!id) throw new Error('id обязателен');
  const transition = await prisma.transitions.update({
    where: { id: String(id) },
    data: { статус: 'completed' },
  });
  await updateNaryadStatus(transition.naryadNomer);
  return { ok: true, transition };
}

router.post('/ingest', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { action, ...payload } = req.body;
  if (!action) {
    res.status(400).json({ error: 'action обязателен' });
    return;
  }

  try {
    let result: unknown;
    switch (action) {
      case 'uploadCatalog':
        result = await handleUploadCatalog(payload);
        break;
      case 'createTransition':
        result = await handleCreateTransition(payload);
        break;
      case 'completeTransition':
        result = await handleCompleteTransition(payload);
        break;
      default:
        res.status(400).json({ error: `Неизвестный action: ${action}` });
        return;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Ошибка VBA-запроса' });
  }
});

export default router;
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
      where: { code: String(r['Код'] || '') },
      update: {},
      create: {
        code: String(r['Код'] || ''),
        name: String(r['Наименование'] || ''),
        designation: String(r['Обозначение'] || ''),
        designation2: String(r['Обозначение 2'] || ''),
        parentQty: Number(r['Кол-во на родителя'] || 0),
        blankType: String(r['Тип заготовки'] || ''),
        material: String(r['Материал'] || ''),
        materialGrade: String(r['Марка материала'] || ''),
        blankSize: String(r['Размер заготовки'] || ''),
        wallThickness: Number(r['Толщина стенки'] || 0),
        cutLength: Number(r['Длина резки'] || 0),
        ppb: String(r['ППБ'] || ''),
        blankWeight: Number(r['Масса заготовки'] || 0),
        partWeight: Number(r['Масса детали'] || 0),
        cutting: toBool(r['Резка']),
        heatTreatment: toBool(r['Термообработка']),
        plasma: toBool(r['Плазма']),
        turning: toBool(r['Токарная']),
        milling: toBool(r['Фрезерная']),
        drilling: toBool(r['Сверлильная']),
        fitting: toBool(r['Слесарная']),
        bending: toBool(r['Гибка']),
        coating: toBool(r['Покрытие']),
        priority: String(r['Приоритет'] || ''),
      },
    });
    count++;
  }
  return { ok: true, inserted: count };
}

async function handleCreateTransition(payload: Record<string, unknown>) {
  const { orderNumber, description, operator, time, melt, machine, qty } = payload;
  if (!orderNumber || !description || !machine) {
    throw new Error('Обязательны: orderNumber, description, machine');
  }
  const number = await generateTransitionNumber(prisma as never, String(orderNumber));
  const transition = await prisma.transitions.create({
    data: {
      orderNumber: String(orderNumber),
      number,
      description: String(description),
      operator: String(operator || ''),
      time: Number(time || 0),
      melt: melt ? String(melt) : null,
      machine: String(machine),
      qty: Number(qty || 0),
      status: 'in_progress',
    },
  });
  return { ok: true, transition };
}

async function handleCompleteTransition(payload: Record<string, unknown>) {
  const { id } = payload;
  if (!id) throw new Error('id обязателен');
  const transition = await prisma.transitions.update({
    where: { id: String(id) },
    data: { status: 'completed' },
  });
  await updateNaryadStatus(transition.orderNumber);
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
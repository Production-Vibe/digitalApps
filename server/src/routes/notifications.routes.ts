import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { param } from '../lib/request';

const router = Router();

router.get('/my', requireAuth('operator', 'shift', 'otk', 'master'), async (req: AuthRequest, res) => {
  const user = req.user!;
  const or: Record<string, unknown>[] = [];
  if (user.login) or.push({ targetLogin: user.login });
  if (user.role) or.push({ targetRole: user.role });

  const where: Record<string, unknown> = { OR: or };
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { ...where, isRead: false } }),
  ]);
  res.json({ unreadCount, notifications });
});

router.post('/:id/read', requireAuth('operator', 'shift', 'otk', 'master'), async (req: AuthRequest, res) => {
  const user = req.user!;
  const notification = await prisma.notification.findUnique({ where: { id: param(req, 'id') } });
  if (!notification) { res.status(404).json({ error: 'Уведомление не найдено' }); return; }

  const mine = (notification.targetLogin && notification.targetLogin === user.login) ||
    (notification.targetRole && notification.targetRole === user.role);
  if (!mine) { res.status(403).json({ error: 'Недостаточно прав' }); return; }

  await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
  res.json({ ok: true });
});

router.post('/read-all', requireAuth('operator', 'shift', 'otk', 'master'), async (req: AuthRequest, res) => {
  const user = req.user!;
  const or: Record<string, unknown>[] = [];
  if (user.login) or.push({ targetLogin: user.login });
  if (user.role) or.push({ targetRole: user.role });
  await prisma.notification.updateMany({
    where: { OR: or, isRead: false },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

export default router;
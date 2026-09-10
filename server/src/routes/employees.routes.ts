import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth('master', 'shift'), async (req, res) => {
  const role = req.query.role as string | undefined;
  const where: Record<string, unknown> = {};
  if (role) where.role = role;
  const employees = await prisma.employees.findMany({ where, select: { login: true, фио: true, role: true } });
  res.json(employees);
});

export default router;

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { param } from '../lib/request';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const CREATABLE_ROLES = ['master', 'shift', 'operator', 'otk'] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];

function isCreatableRole(role: unknown): role is CreatableRole {
  return typeof role === 'string' && (CREATABLE_ROLES as readonly string[]).includes(role);
}

function normalizeEmployee(e: { login: string; fullName: string; role: string; isActive: boolean }) {
  return { login: e.login, fullName: e.fullName, role: e.role, isActive: e.isActive };
}

function validateFullName(fullName: unknown): string | null {
  if (typeof fullName !== 'string') return null;
  const v = fullName.trim();
  if (!v || v.split(/\s+/).length < 2 || v.length > 100) return null;
  return v;
}

router.get('/employees', requireAuth('admin'), async (req, res) => {
  const employees = await prisma.employees.findMany({
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
  });
  res.json(employees.map(normalizeEmployee));
});

router.post('/employees', requireAuth('admin'), async (req, res) => {
  const { fullName, login, role, password } = req.body || {};
  const loginTrim = typeof login === 'string' ? login.trim() : '';
  const fullNameNorm = validateFullName(fullName);

  if (!loginTrim || loginTrim.length > 40) {
    res.status(400).json({ error: 'Логин обязателен (до 40 символов)' });
    return;
  }
  if (!fullNameNorm) {
    res.status(400).json({ error: 'Укажите фамилию и инициалы' });
    return;
  }
  if (!isCreatableRole(role)) {
    res.status(400).json({ error: 'Недопустимая роль' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
    return;
  }

  try {
    const employee = await prisma.employees.create({
      data: {
        login: loginTrim,
        fullName: fullNameNorm,
        role,
        password: await bcrypt.hash(password, 10),
      },
    });
    res.status(201).json(normalizeEmployee(employee));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      res.status(409).json({ error: 'Логин уже занят' });
      return;
    }
    throw e;
  }
});

router.put('/employees/:login', requireAuth('admin'), async (req, res) => {
  const { role, password } = req.body || {};
  const data: Record<string, unknown> = {};

  if (role !== undefined) {
    if (!isCreatableRole(role)) {
      res.status(400).json({ error: 'Недопустимая роль' });
      return;
    }
    data.role = role;
  }
  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
      return;
    }
    data.password = await bcrypt.hash(password, 10);
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Нечего обновлять' });
    return;
  }

  try {
    const employee = await prisma.employees.update({ where: { login: param(req, 'login') }, data });
    res.json(normalizeEmployee(employee));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      res.status(404).json({ error: 'Сотрудник не найден' });
      return;
    }
    throw e;
  }
});

router.patch('/employees/:login', requireAuth('admin'), async (req: AuthRequest, res) => {
  const isActive = req.body && req.body.isActive;
  if (typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'Поле isActive обязательно' });
    return;
  }
  const login = param(req, 'login');
  if (login === req.user?.login && !isActive) {
    res.status(400).json({ error: 'Нельзя отключить собственную учётную запись' });
    return;
  }
  try {
    const employee = await prisma.employees.update({
      where: { login },
      data: { isActive },
    });
    res.json(normalizeEmployee(employee));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      res.status(404).json({ error: 'Сотрудник не найден' });
      return;
    }
    throw e;
  }
});

export default router;
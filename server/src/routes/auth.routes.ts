import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { isLoginBlocked, recordLoginFailure, resetLoginAttempts, authLimiter } from '../lib/login-throttle';
import type { EmployeeRole } from '../lib/naryad-status';

const router = Router();

const REFRESH_COOKIE = 'nd_refresh';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions(persist: boolean): import('express').CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    ...(persist ? { maxAge: REFRESH_TTL_MS } : {}),
  };
}

function buildUser(employee: { login: string; fullName: string; role: EmployeeRole }) {
  return { login: employee.login, fullName: employee.fullName, role: employee.role };
}

function startSession(
  res: import('express').Response,
  employee: { login: string; fullName: string; role: EmployeeRole },
  persist: boolean
) {
  const user = buildUser(employee);
  const accessToken = jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
  const refreshToken = jwt.sign({ login: employee.login, persist }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(persist));
  res.json({ accessToken, user });
}

router.post('/login', authLimiter, async (req, res) => {
  const { login, password, remember } = req.body || {};
  if (!login || !password) {
    res.status(400).json({ error: 'Логин и пароль обязательны' });
    return;
  }
  if (isLoginBlocked(login)) {
    res.status(429).json({ error: 'Логин заблокирован на 15 минут' });
    return;
  }

  const employee = await prisma.employees.findUnique({ where: { login } });
  const valid = employee && (await bcrypt.compare(password, employee.password));
  if (!employee || !valid) {
    recordLoginFailure(login);
    res.status(401).json({ error: 'Неверный логин или пароль' });
    return;
  }
  if (!employee.isActive) {
    res.status(403).json({ error: 'Учётная запись отключена' });
    return;
  }

  resetLoginAttempts(login);
  startSession(res, employee, !!remember);
});

router.post('/register', authLimiter, async (req, res) => {
  const { fullName, login, password, confirmPassword, remember } = req.body || {};
  const loginTrim = typeof login === 'string' ? login.trim() : '';
  const fullNameTrim = typeof fullName === 'string' ? fullName.trim() : '';

  if (!loginTrim || loginTrim.length > 40) {
    res.status(400).json({ error: 'Логин обязателен (до 40 символов)' });
    return;
  }
  if (!fullNameTrim || fullNameTrim.split(/\s+/).length < 2 || fullNameTrim.length > 100) {
    res.status(400).json({ error: 'Укажите фамилию и инициалы' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: 'Пароли не совпадают' });
    return;
  }

  try {
    const employee = await prisma.employees.create({
      data: {
        login: loginTrim,
        fullName: fullNameTrim,
        role: 'operator',
        password: await bcrypt.hash(password, 10),
      },
    });
    startSession(res, employee, !!remember);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      res.status(409).json({ error: 'Логин уже занят' });
      return;
    }
    throw e;
  }
});

router.post('/refresh', authLimiter, async (req, res) => {
  const refreshToken = req.cookies && req.cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    res.status(401).json({ error: 'Не авторизован' });
    return;
  }
  try {
    const payload = jwt.verify(refreshToken, config.jwtSecret) as { login: string; persist?: boolean };
    const employee = await prisma.employees.findUnique({ where: { login: payload.login } });
    if (!employee || !employee.isActive) {
      res.clearCookie(REFRESH_COOKIE);
      res.status(401).json({ error: 'Пользователь не найден' });
      return;
    }
    startSession(res, employee, !!payload.persist);
  } catch {
    res.clearCookie(REFRESH_COOKIE);
    res.status(401).json({ error: 'Неверный refresh token' });
  }
});

router.get('/session', async (req, res) => {
  const refreshToken = req.cookies && req.cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    res.status(401).json({ error: 'Не авторизован' });
    return;
  }
  try {
    const payload = jwt.verify(refreshToken, config.jwtSecret) as { login: string; persist?: boolean };
    const employee = await prisma.employees.findUnique({ where: { login: payload.login } });
    if (!employee || !employee.isActive) {
      res.clearCookie(REFRESH_COOKIE);
      res.status(401).json({ error: 'Пользователь не найден' });
      return;
    }
    startSession(res, employee, !!payload.persist);
  } catch {
    res.clearCookie(REFRESH_COOKIE);
    res.status(401).json({ error: 'Не авторизован' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE);
  res.json({ ok: true });
});

router.get('/me', requireAuth(), (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

export default router;
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { isLoginBlocked, recordLoginFailure, resetLoginAttempts, authLimiter } from '../lib/login-throttle';

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

  resetLoginAttempts(login);
  const persist = !!remember;
  const user = { login: employee.login, fullName: employee.fullName, role: employee.role };
  const accessToken = jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
  const refreshToken = jwt.sign({ login: employee.login, persist }, config.jwtSecret, { expiresIn: '7d' });

  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(persist));
  res.json({ accessToken, user });
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
    if (!employee) {
      res.status(401).json({ error: 'Пользователь не найден' });
      return;
    }
    const user = { login: employee.login, fullName: employee.fullName, role: employee.role };
    const accessToken = jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
    const newRefreshToken = jwt.sign(
      { login: employee.login, persist: !!payload.persist },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
    res.cookie(REFRESH_COOKIE, newRefreshToken, cookieOptions(!!payload.persist));
    res.json({ accessToken });
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
    if (!employee) {
      res.status(401).json({ error: 'Пользователь не найден' });
      return;
    }
    const user = { login: employee.login, fullName: employee.fullName, role: employee.role };
    const accessToken = jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
    res.json({ user, accessToken });
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
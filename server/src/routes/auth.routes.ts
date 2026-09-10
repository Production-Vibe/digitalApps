import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    res.status(400).json({ error: 'Логин и пароль обязательны' });
    return;
  }

  const employee = await prisma.employees.findUnique({ where: { login } });
  if (!employee) {
    res.status(401).json({ error: 'Неверный логин или пароль' });
    return;
  }

  const valid = await bcrypt.compare(password, employee.password);
  if (!valid) {
    res.status(401).json({ error: 'Неверный логин или пароль' });
    return;
  }

  const user = { login: employee.login, фио: employee.фио, role: employee.role };
  const accessToken = jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
  const refreshToken = jwt.sign({ login: employee.login }, config.jwtSecret, { expiresIn: '7d' });

  res.json({ accessToken, refreshToken, user });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken обязателен' });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, config.jwtSecret) as { login: string };
    const employee = await prisma.employees.findUnique({ where: { login: payload.login } });
    if (!employee) {
      res.status(401).json({ error: 'Пользователь не найден' });
      return;
    }

    const user = { login: employee.login, фио: employee.фио, role: employee.role };
    const accessToken = jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
    const newRefreshToken = jwt.sign({ login: employee.login }, config.jwtSecret, { expiresIn: '7d' });

    res.json({ accessToken, refreshToken: newRefreshToken, user });
  } catch {
    res.status(401).json({ error: 'Неверный refresh token' });
  }
});

router.get('/me', requireAuth(), (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

export default router;

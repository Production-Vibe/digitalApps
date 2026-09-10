import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { EmployeeRole } from '../lib/naryad-status';

export interface AuthUser {
  login: string;
  фио: string;
  role: EmployeeRole;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function requireAuth(...roles: EmployeeRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret) as AuthUser;
      req.user = payload;

      if (roles.length > 0 && !roles.includes(payload.role)) {
        res.status(403).json({ error: 'Недостаточно прав' });
        return;
      }

      next();
    } catch {
      res.status(401).json({ error: 'Неверный токен' });
    }
  };
}

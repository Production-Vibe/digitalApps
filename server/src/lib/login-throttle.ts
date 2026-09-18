import rateLimit from 'express-rate-limit';

const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

const attempts = new Map<string, { fails: number; blockedUntil: number }>();

export function isLoginBlocked(login: string): boolean {
  const entry = attempts.get(login);
  if (!entry) return false;
  if (entry.blockedUntil > Date.now()) return true;
  attempts.delete(login);
  return false;
}

export function recordLoginFailure(login: string): void {
  const entry = attempts.get(login) || { fails: 0, blockedUntil: 0 };
  entry.fails += 1;
  if (entry.fails >= MAX_FAILS) {
    entry.fails = 0;
    entry.blockedUntil = Date.now() + LOCK_MS;
  }
  attempts.set(login, entry);
}

export function resetLoginAttempts(login: string): void {
  attempts.delete(login);
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте позже' },
});
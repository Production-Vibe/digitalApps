import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { config } from '../config';

const router = Router();

function validateEndpoint(endpoint: string): boolean {
  return (
    typeof endpoint === 'string' &&
    /^https?:\/\//.test(endpoint) &&
    (/^https:\/\//.test(endpoint) || endpoint.startsWith('http://localhost'))
  );
}

router.get('/vapid-key', requireAuth('operator', 'shift', 'otk', 'master'), (_req, res) => {
  res.json({ publicKey: config.vapidPublicKey || '' });
});

router.post('/subscribe', requireAuth('operator', 'shift', 'otk', 'master'), async (req: AuthRequest, res) => {
  const user = req.user!;
  const { endpoint, keys } = req.body || {};
  if (!validateEndpoint(endpoint) || !keys || !keys.p256dh || !keys.auth) {
    res.status(400).json({ error: 'Невалидная push-подписка' });
    return;
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { login: user.login, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { login: user.login, p256dh: keys.p256dh, auth: keys.auth },
  });
  res.json({ ok: true });
});

router.post('/unsubscribe', requireAuth('operator', 'shift', 'otk', 'master'), async (req: AuthRequest, res) => {
  const user = req.user!;
  const { endpoint } = req.body || {};
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { login: user.login, endpoint } });
  }
  res.json({ ok: true });
});

export default router;
import { sendNotification, setVapidDetails } from 'web-push';
import { config } from '../config';
import { prisma } from './prisma';
import type { NotificationData } from './notify';

export function isPushConfigured(): boolean {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}

export function initWebPush(): void {
  if (!isPushConfigured()) return;
  setVapidDetails(
    config.vapidSubject || config.appUrl,
    config.vapidPublicKey,
    config.vapidPrivateKey,
  );
}

export async function dispatchPush(logins: string[], data: NotificationData): Promise<void> {
  if (!isPushConfigured() || !logins || logins.length === 0) return;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { login: { in: logins } } });
    if (!subs.length) return;
    const payload = JSON.stringify({
      title: data.title,
      message: data.message || '',
      link: data.link || '/',
      url: config.appUrl + (data.link || '/'),
      type: data.type,
    });
    await Promise.all(subs.map(async (s) => {
      try {
        await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 86400 },
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } }).catch(() => {});
        } else {
          console.error('[push] send failed:', code ?? err);
        }
      }
    }));
  } catch (err) {
    console.error('[push] dispatch error:', err);
  }
}
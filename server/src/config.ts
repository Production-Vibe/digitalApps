import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  vbaSecret: process.env.VBA_SECRET || 'dev-vba-secret',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/digital_narad',
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
};

if (
  config.nodeEnv === 'production' &&
  (config.jwtSecret === 'dev-secret' || config.vbaSecret === 'dev-vba-secret')
) {
  throw new Error('Некорректная конфигурация: in production JWT_SECRET и VBA_SECRET обязательны');
}

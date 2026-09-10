import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  vbaSecret: process.env.VBA_SECRET || 'dev-vba-secret',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/digital_narad',
};

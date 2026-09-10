import express from 'express';
import path from 'path';
import { config } from './config';
import { prisma } from './lib/prisma';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.redirect('/login');
});

app.get('/login', (_req, res) => {
  res.render('login', { error: null });
});

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
});

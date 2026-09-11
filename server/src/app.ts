import express from 'express';
import path from 'path';
import { config } from './config';
import { prisma } from './lib/prisma';
import { wrapRouter } from './lib/async-wrap';
import authRoutes from './routes/auth.routes';
import pageRoutes from './routes/page.routes';
import catalogRoutes from './routes/catalog.routes';
import equipmentRoutes from './routes/equipment.routes';
import launchesRoutes from './routes/launches.routes';
import workordersRoutes from './routes/workorders.routes';
import shiftsRoutes from './routes/shifts.routes';
import transitionsRoutes from './routes/transitions.routes';
import otkRoutes from './routes/otk.routes';
import employeesRoutes from './routes/employees.routes';
import vbaRoutes from './routes/vba.routes';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.redirect('/login');
});

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

interface PrismaError {
  code?: string;
}

app.use('/api', wrapRouter(authRoutes));
app.use('/api/catalog', wrapRouter(catalogRoutes));
app.use('/api/equipment', wrapRouter(equipmentRoutes));
app.use('/api/launches', wrapRouter(launchesRoutes));
app.use('/api/work-orders', wrapRouter(workordersRoutes));
app.use('/api/shifts', wrapRouter(shiftsRoutes));
app.use('/api/transitions', wrapRouter(transitionsRoutes));
app.use('/api/otk', wrapRouter(otkRoutes));
app.use('/api/employees', wrapRouter(employeesRoutes));
app.use('/api/vba', wrapRouter(vbaRoutes));
app.use('/', wrapRouter(pageRoutes));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: PrismaError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && err.code === 'P2003') {
    res.status(400).json({ error: 'Ссылка на несуществующую запись (нарушение внешнего ключа)' });
    return;
  }
  if (err && err.code === 'P2025') {
    res.status(404).json({ error: 'Запись не найдена' });
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[server] unhandled error:', msg);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
});

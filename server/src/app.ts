import express from 'express';
import path from 'path';
import { config } from './config';
import { prisma } from './lib/prisma';
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

app.use('/api', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/launches', launchesRoutes);
app.use('/api/work-orders', workordersRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/transitions', transitionsRoutes);
app.use('/api/otk', otkRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/vba', vbaRoutes);
app.use('/', pageRoutes);

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
});

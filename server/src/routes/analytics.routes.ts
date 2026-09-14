import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { queryStr } from '../lib/request';
import { getDashboard } from '../lib/analytics';

const router = Router();

router.get('/dashboard', requireAuth('master'), async (req, res) => {
  const from = queryStr(req, 'from');
  const to = queryStr(req, 'to');
  const data = await getDashboard(from, to);
  res.json(data);
});

export default router;
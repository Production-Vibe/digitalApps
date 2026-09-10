import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/login', (_req, res) => {
  res.render('login', { error: null });
});

router.get('/master', requireAuth('master'), (req: AuthRequest, res) => {
  res.render('master-app', { user: req.user });
});

router.get('/shift', requireAuth('shift'), (req: AuthRequest, res) => {
  res.render('shift-app', { user: req.user });
});

router.get('/operator', requireAuth('operator'), (req: AuthRequest, res) => {
  res.render('operator', { user: req.user });
});

router.get('/otk', requireAuth('otk'), (req: AuthRequest, res) => {
  res.render('otk-app', { user: req.user });
});

export default router;

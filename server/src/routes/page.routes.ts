import { Router } from 'express';

const router = Router();

router.get('/login', (_req, res) => {
  res.render('login', { error: null });
});

router.get('/master', (_req, res) => {
  res.render('master-app');
});

router.get('/shift', (_req, res) => {
  res.render('shift-app');
});

router.get('/operator', (_req, res) => {
  res.render('operator');
});

router.get('/otk', (_req, res) => {
  res.render('otk-app');
});

export default router;

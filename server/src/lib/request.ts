import { Request } from 'express';

export function param(req: Request, name: string): string {
  const val = req.params[name];
  if (Array.isArray(val)) return val[0];
  return val;
}

export function queryStr(req: Request, name: string): string | undefined {
  const val = req.query[name];
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) return String(val[0]);
  return String(val);
}

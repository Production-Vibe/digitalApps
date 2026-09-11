import { NextFunction, Request, Response, Router } from 'express';

type Fn = (req: Request, res: Response, next: NextFunction) => unknown;

export function asyncHandler(fn: Fn) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).catch(next);
      }
    } catch (e) {
      next(e);
    }
  };
}

interface LayerLike {
  route?: { stack?: Array<{ handle?: Fn }> };
  handle?: Fn;
}

export function wrapRouter(router: Router): Router {
  const layers = (router as unknown as { stack?: LayerLike[] }).stack;
  if (!layers) return router;
  for (const layer of layers) {
    const routeStack = layer.route?.stack;
    if (routeStack) {
      for (const routeLayer of routeStack) {
        if (typeof routeLayer.handle === 'function') {
          routeLayer.handle = asyncHandler(routeLayer.handle);
        }
      }
    } else if (typeof layer.handle === 'function') {
      layer.handle = asyncHandler(layer.handle);
    }
  }
  return router;
}
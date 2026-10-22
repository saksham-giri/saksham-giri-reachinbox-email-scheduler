import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 does not forward rejected promises to the error handler on its own.
export const asyncHandler =
  <R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req as R, res, next).catch(next);
  };

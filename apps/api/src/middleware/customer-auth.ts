import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  customerAuthService,
  type CustomerSessionContext,
} from '../services/customer-auth.service.js';
import { readCustomerSessionCookie } from '../utils/customer-session-cookie.js';
import { ProductServiceError } from '../services/product.service.js';

export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    res.set('Cache-Control', 'no-store');
    const token = readCustomerSessionCookie(req);
    if (!token) {
      res.status(401).json({ success: false, message: 'Customer sign-in is required.' });
      return;
    }
    const context = await customerAuthService.resolveSession(token);
    if (!context) {
      res.status(401).json({ success: false, message: 'Your customer session has expired.' });
      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const provided = Buffer.from(req.get('x-csrf-token') ?? '', 'utf8');
      const expected = Buffer.from(context.csrfToken, 'utf8');
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        res
          .status(403)
          .json({ success: false, message: 'The security token is invalid or missing.' });
        return;
      }
    }
    res.locals.customerContext = context;
    next();
  } catch (error) {
    next(error);
  }
}

export function getCustomerContext(res: Response): CustomerSessionContext {
  const context: unknown = res.locals.customerContext;
  if (
    typeof context === 'object' &&
    context !== null &&
    'actor' in context &&
    'csrfToken' in context &&
    'tokenHash' in context
  ) {
    return context as CustomerSessionContext;
  }
  throw new ProductServiceError('Customer session context is unavailable.', 500);
}

export async function attachOptionalCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readCustomerSessionCookie(req);
    if (!token) {
      next();
      return;
    }
    const context = await customerAuthService.resolveSession(token);
    if (context) res.locals.customerContext = context;
  } catch (error) {
    next(error);
    return;
  }
  next();
}

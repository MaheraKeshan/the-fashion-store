import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ProductServiceError } from '../services/product.service.js';
import { resolveAdminSession, type AdminSessionContext } from '../services/admin-auth.service.js';
import { readAdminSessionCookie } from '../utils/admin-session-cookie.js';

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    res.set('Cache-Control', 'no-store');
    const token = readAdminSessionCookie(req);
    if (!token) {
      res.status(401).json({ success: false, message: 'Administrator sign-in is required.' });
      return;
    }

    const context = await resolveAdminSession(token);
    if (!context) {
      res.status(401).json({ success: false, message: 'Administrator session has expired.' });
      return;
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const providedToken = Buffer.from(req.get('x-csrf-token') ?? '', 'utf8');
      const expectedToken = Buffer.from(context.csrfToken, 'utf8');
      if (
        providedToken.length !== expectedToken.length ||
        !timingSafeEqual(providedToken, expectedToken)
      ) {
        res
          .status(403)
          .json({ success: false, message: 'The security token is invalid or missing.' });
        return;
      }
    }

    res.locals.adminContext = context;
    next();
  } catch (error) {
    next(error);
  }
}

export function getAdminContext(res: Response): AdminSessionContext {
  const context: unknown = res.locals.adminContext;
  if (
    typeof context === 'object' &&
    context !== null &&
    'actor' in context &&
    'csrfToken' in context &&
    'tokenHash' in context
  ) {
    return context as AdminSessionContext;
  }
  throw new ProductServiceError('Administrator session context is unavailable.', 500);
}

import rateLimit from 'express-rate-limit';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { requireAdmin, getAdminContext } from '../middleware/admin-auth.js';
import { adminLoginSchema } from '../schemas/admin-auth.js';
import { createAdminSession, revokeAdminSession } from '../services/admin-auth.service.js';
import { clearAdminSessionCookie, setAdminSessionCookie } from '../utils/admin-session-cookie.js';

export const adminAuthRouter = Router();

const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sign-in attempts. Please wait and try again.',
  },
});

function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.get('origin') !== new URL(env.CLIENT_URL).origin) {
    res
      .status(403)
      .json({ success: false, message: 'Administrator sign-in must come from the store website.' });
    return;
  }
  next();
}

adminAuthRouter.post('/login', requireSameOrigin, adminLoginRateLimit, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const input = adminLoginSchema.parse(req.body);
    const session = await createAdminSession(input.email, input.password);
    setAdminSessionCookie(res, session.token);
    res.status(200).json({
      success: true,
      data: { user: session.user, csrfToken: session.csrfToken, expiresAt: session.expiresAt },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Enter a valid email address and password.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});

adminAuthRouter.get('/session', requireAdmin, (_req, res) => {
  const { actor, csrfToken, expiresAt } = getAdminContext(res);
  res.status(200).json({
    success: true,
    data: {
      user: { email: actor.email, role: actor.role },
      csrfToken,
      expiresAt,
    },
  });
});

adminAuthRouter.post('/logout', requireAdmin, async (_req, res, next) => {
  try {
    await revokeAdminSession(getAdminContext(res));
    clearAdminSessionCookie(res);
    res.status(200).json({ success: true, data: { signedOut: true } });
  } catch (error) {
    next(error);
  }
});

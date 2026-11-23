import rateLimit from 'express-rate-limit';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { z } from 'zod';
import { env } from '../config/env.js';
import { createRateLimitStore } from '../config/rate-limit-store.js';
import { getCustomerContext, requireCustomer } from '../middleware/customer-auth.js';
import {
  customerLoginSchema,
  customerRegistrationSchema,
  updateCustomerProfileSchema,
  updateCustomerAddressSchema,
  changeCustomerPasswordSchema,
  deleteCustomerAccountSchema,
  requestCustomerPasswordResetSchema,
  completeCustomerPasswordResetSchema,
} from '../schemas/customer-auth.js';
import { customerWishlistUpdateSchema } from '../schemas/customer-saved-items.js';
import { customerCartUpdateSchema } from '../schemas/cart.js';
import { customerAuthService } from '../services/customer-auth.service.js';
import {
  getCustomerCart,
  getCustomerWishlist,
  replaceCustomerCart,
  replaceCustomerWishlist,
} from '../services/customer-saved-items.service.js';
import {
  clearCustomerSessionCookie,
  setCustomerSessionCookie,
} from '../utils/customer-session-cookie.js';
import { listCustomerOrders } from '../services/order.service.js';

export const customerAuthRouter = Router();

const customerOrdersQuerySchema = z
  .object({
    cursor: z
      .string()
      .regex(/^\d{13}_[a-f\d]{24}$/i)
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const customerAuthRateLimit = rateLimit({
  store: createRateLimitStore('customer-auth'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many account attempts. Please wait and try again.' },
});

const passwordResetRequestRateLimit = rateLimit({
  store: createRateLimitStore('password-reset-request'),
  windowMs: 15 * 60 * 1000,
  limit: 5,
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please wait and try again.',
  },
});

const passwordResetCompletionRateLimit = rateLimit({
  store: createRateLimitStore('password-reset-completion'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset attempts. Please wait and try again.',
  },
});

const accountDeletionRateLimit = rateLimit({
  store: createRateLimitStore('customer-account-deletion'),
  windowMs: 15 * 60 * 1000,
  limit: 5,
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many account deletion attempts. Please wait.' },
});

function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.get('origin') !== new URL(env.CLIENT_URL).origin) {
    res
      .status(403)
      .json({ success: false, message: 'Account requests must come from the store website.' });
    return;
  }
  next();
}

customerAuthRouter.post(
  '/register',
  requireSameOrigin,
  customerAuthRateLimit,
  async (req, res, next) => {
    try {
      const input = customerRegistrationSchema.parse(req.body);
      const session = await customerAuthService.register(input.name, input.email, input.password);
      setCustomerSessionCookie(res, session.token);
      res.status(201).json({
        success: true,
        data: { user: session.user, csrfToken: session.csrfToken, expiresAt: session.expiresAt },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Enter a valid name, email and password.',
          errors: error.issues,
        });
        return;
      }
      next(error);
    }
  },
);

customerAuthRouter.post(
  '/login',
  requireSameOrigin,
  customerAuthRateLimit,
  async (req, res, next) => {
    try {
      const input = customerLoginSchema.parse(req.body);
      const session = await customerAuthService.login(input.email, input.password);
      setCustomerSessionCookie(res, session.token);
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
  },
);

customerAuthRouter.post(
  '/password-reset/request',
  requireSameOrigin,
  passwordResetRequestRateLimit,
  async (req, res, next) => {
    try {
      const input = requestCustomerPasswordResetSchema.parse(req.body);
      await customerAuthService.requestPasswordReset(input.email);
      res.status(200).json({
        success: true,
        data: {
          requested: true,
          message: 'If an account exists for that email, reset instructions will be sent.',
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Enter a valid email address.',
          errors: error.issues,
        });
        return;
      }
      next(error);
    }
  },
);

customerAuthRouter.post(
  '/password-reset/complete',
  requireSameOrigin,
  passwordResetCompletionRateLimit,
  async (req, res, next) => {
    try {
      const input = completeCustomerPasswordResetSchema.parse(req.body);
      await customerAuthService.completePasswordReset(input.token, input.newPassword);
      res.status(200).json({
        success: true,
        data: { passwordReset: true },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Enter a valid reset token and 10-character-or-longer password.',
          errors: error.issues,
        });
        return;
      }
      next(error);
    }
  },
);

customerAuthRouter.get('/session', requireCustomer, (_req, res) => {
  const { actor, csrfToken, expiresAt } = getCustomerContext(res);
  res.status(200).json({
    success: true,
    data: {
      user: {
        name: actor.name,
        email: actor.email,
        ...(actor.phone && { phone: actor.phone }),
        ...(actor.deliveryAddress && { deliveryAddress: actor.deliveryAddress }),
      },
      csrfToken,
      expiresAt,
    },
  });
});

customerAuthRouter.get('/cart', requireCustomer, async (_req, res, next) => {
  try {
    const cart = await getCustomerCart(getCustomerContext(res).actor.id);
    res.status(200).json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

customerAuthRouter.put('/cart', requireSameOrigin, requireCustomer, async (req, res, next) => {
  try {
    const input = customerCartUpdateSchema.parse(req.body);
    const cart = await replaceCustomerCart(getCustomerContext(res).actor.id, input.items);
    res.status(200).json({ success: true, data: cart });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Enter valid shopping bag items.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});

customerAuthRouter.get('/wishlist', requireCustomer, async (_req, res, next) => {
  try {
    const wishlist = await getCustomerWishlist(getCustomerContext(res).actor.id);
    res.status(200).json({ success: true, data: wishlist });
  } catch (error) {
    next(error);
  }
});

customerAuthRouter.put(
  '/wishlist',
  requireSameOrigin,
  requireCustomer,
  async (req, res, next) => {
    try {
      const input = customerWishlistUpdateSchema.parse(req.body);
      const wishlist = await replaceCustomerWishlist(
        getCustomerContext(res).actor.id,
        input.productIds,
      );
      res.status(200).json({ success: true, data: wishlist });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Enter valid wishlist products.',
          errors: error.issues,
        });
        return;
      }
      next(error);
    }
  },
);

customerAuthRouter.patch('/profile', requireSameOrigin, requireCustomer, async (req, res, next) => {
  try {
    const input = updateCustomerProfileSchema.parse(req.body);
    const context = getCustomerContext(res);
    const user = await customerAuthService.updateProfile(context.actor.id, input.name, input.phone);
    res.status(200).json({ success: true, data: { user } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Enter a valid name and Sri Lankan mobile number.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});

customerAuthRouter.patch(
  '/delivery-address',
  requireSameOrigin,
  requireCustomer,
  async (req, res, next) => {
    try {
      const input = updateCustomerAddressSchema.parse(req.body);
      const context = getCustomerContext(res);
      const user = await customerAuthService.updateDeliveryAddress(context.actor.id, input);
      res.status(200).json({ success: true, data: { user } });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Enter a valid Sri Lankan delivery address.',
          errors: error.issues,
        });
        return;
      }
      next(error);
    }
  },
);

customerAuthRouter.post('/logout', requireCustomer, async (_req, res, next) => {
  try {
    await customerAuthService.revokeSession(getCustomerContext(res));
    clearCustomerSessionCookie(res);
    res.status(200).json({ success: true, data: { signedOut: true } });
  } catch (error) {
    next(error);
  }
});

customerAuthRouter.delete(
  '/account',
  requireSameOrigin,
  accountDeletionRateLimit,
  requireCustomer,
  async (req, res, next) => {
    try {
      const input = deleteCustomerAccountSchema.parse(req.body);
      await customerAuthService.deleteAccount(getCustomerContext(res), input.currentPassword);
      clearCustomerSessionCookie(res);
      res.status(200).json({ success: true, data: { accountDeleted: true } });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Confirm account deletion with your current password.',
          errors: error.issues,
        });
        return;
      }
      next(error);
    }
  },
);

customerAuthRouter.patch(
  '/password',
  requireSameOrigin,
  requireCustomer,
  async (req, res, next) => {
    try {
      const input = changeCustomerPasswordSchema.parse(req.body);
      await customerAuthService.changePassword(
        getCustomerContext(res),
        input.currentPassword,
        input.newPassword,
      );
      res.status(200).json({ success: true, data: { passwordChanged: true } });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Enter the current password and a valid 10-character-or-longer new password.',
          errors: error.issues,
        });
        return;
      }
      next(error);
    }
  },
);

customerAuthRouter.get('/sessions', requireCustomer, async (_req, res, next) => {
  try {
    const sessions = await customerAuthService.listSessions(getCustomerContext(res));
    res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
});

customerAuthRouter.post(
  '/sessions/revoke-others',
  requireSameOrigin,
  requireCustomer,
  async (_req, res, next) => {
    try {
      await customerAuthService.revokeOtherSessions(getCustomerContext(res));
      res.status(200).json({ success: true, data: { revokedOthers: true } });
    } catch (error) {
      next(error);
    }
  },
);

customerAuthRouter.get('/orders', requireCustomer, async (req, res, next) => {
  try {
    const query = customerOrdersQuerySchema.parse(req.query);
    const context = getCustomerContext(res);
    const result = await listCustomerOrders(context.actor.id, query.cursor, query.limit);
    res
      .status(200)
      .json({ success: true, data: result.data, pagination: { nextCursor: result.nextCursor } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid order history parameters.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});

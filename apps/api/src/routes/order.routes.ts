import rateLimit from 'express-rate-limit';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { ZodError, z } from 'zod';
import {
  createOrderRequestSchema,
  createOrderRequestWithPaymentSchema,
  idempotencyKeySchema,
  trackOrderRequestSchema,
} from '../schemas/order.js';
import { createCheckoutOrder, trackCODOrder } from '../services/order.service.js';
import { attachOptionalCustomer, getCustomerContext } from '../middleware/customer-auth.js';
import { env } from '../config/env.js';
import { createRateLimitStore } from '../config/rate-limit-store.js';
import {
  assertPayHereConfigured,
  assertPayHereOrderPayable,
  buildPayHereCheckout,
  reconcilePayHereNotification,
} from '../services/payhere.service.js';

export const orderRouter = Router();
export const payHereRouter = Router();

const orderTrackingRateLimit = rateLimit({
  store: createRateLimitStore('order-tracking'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many order lookup attempts. Please wait and try again.',
  },
});

const codPlacementRateLimit = rateLimit({
  store: createRateLimitStore('checkout'),
  windowMs: 15 * 60 * 1000,
  limit: 8,
  passOnStoreError: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many order attempts. Please wait and try again.',
  },
});

const payHereNotificationSchema = z.object({
  merchant_id: z.string().min(1).max(50),
  order_id: z.string().min(1).max(100),
  payhere_amount: z.string().regex(/^\d+\.\d{2}$/),
  payhere_currency: z.string().length(3),
  status_code: z.enum(['2', '0', '-1', '-2', '-3']),
  md5sig: z.string().regex(/^[a-f\d]{32}$/i),
  payment_id: z.string().max(100).optional(),
});

function requireStorefrontOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.get('origin') !== new URL(env.CLIENT_URL).origin) {
    res
      .status(403)
      .json({ success: false, message: 'COD orders must be placed from the store website.' });
    return;
  }
  next();
}

function handleValidationError(error: unknown, res: Response, next: NextFunction, message: string) {
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, message, errors: error.issues });
    return;
  }
  next(error);
}

orderRouter.post('/track', orderTrackingRateLimit, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const input = trackOrderRequestSchema.parse(req.body);
    const order = await trackCODOrder(input.orderNumber, input.phone);
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Enter a valid order number and Sri Lankan mobile number.',
        errors: error.issues,
      });
      return;
    }
    next(error);
  }
});

orderRouter.post(
  '/',
  requireStorefrontOrigin,
  codPlacementRateLimit,
  attachOptionalCustomer,
  async (req, res, next) => {
    try {
      const input = createOrderRequestSchema.parse(req.body);
      const idempotencyKey = idempotencyKeySchema.parse(req.get('idempotency-key'));
      const customerContext = res.locals.customerContext ? getCustomerContext(res) : undefined;
      const result = await createCheckoutOrder(
        input,
        idempotencyKey,
        customerContext?.actor.id,
        'cash-on-delivery',
      );
      res.status(result.replayed ? 200 : 201).json({ success: true, data: result.order });
    } catch (error) {
      handleValidationError(error, res, next, 'Invalid COD order request.');
    }
  },
);

orderRouter.post(
  '/payhere/checkout',
  requireStorefrontOrigin,
  codPlacementRateLimit,
  attachOptionalCustomer,
  async (req, res, next) => {
    try {
      const input = createOrderRequestWithPaymentSchema.parse(req.body);
      if (input.paymentMethod !== 'payhere') {
        res.status(400).json({ success: false, message: 'Invalid PayHere payment method.' });
        return;
      }
      const idempotencyKey = idempotencyKeySchema.parse(req.get('idempotency-key'));
      assertPayHereConfigured();
      const customerContext = res.locals.customerContext ? getCustomerContext(res) : undefined;
      const { customer, deliveryAddress, paymentMethod, ...checkoutInput } = input;
      const result = await createCheckoutOrder(
        { customer, deliveryAddress, ...checkoutInput },
        idempotencyKey,
        customerContext?.actor.id,
        paymentMethod,
      );
      assertPayHereOrderPayable(result.order);
      const checkout = buildPayHereCheckout(result.order, customer, deliveryAddress);
      res.status(result.replayed ? 200 : 201).json({
        success: true,
        data: { order: result.order, checkout },
      });
    } catch (error) {
      handleValidationError(error, res, next, 'Invalid PayHere checkout request.');
    }
  },
);

payHereRouter.post('/notify', async (req, res, next) => {
  try {
    const input = payHereNotificationSchema.parse(req.body);
    await reconcilePayHereNotification(input);
    res.status(200).send('OK');
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).send('INVALID');
      return;
    }
    next(error);
  }
});

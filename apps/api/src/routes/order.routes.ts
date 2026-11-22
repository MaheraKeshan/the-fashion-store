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
import { buildPayHereCheckout, reconcilePayHereNotification } from '../services/payhere.service.js';
export const orderRouter = Router();
export const payHereRouter = Router();

const orderTrackingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many order lookup attempts. Please wait and try again.',
  },
});

const codPlacementRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many order attempts. Please wait and try again.',
  },
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
      const customerContext = res.locals.customerContext
        ? getCustomerContext(res)
        : undefined;
      const result = await createCheckoutOrder(
        input,
        idempotencyKey,
        customerContext?.actor.id,
        'cash-on-delivery',
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
            const customerContext = res.locals.customerContext
              ? getCustomerContext(res)
              : undefined;
            const { customer, deliveryAddress, paymentMethod, ...checkoutInput } = input;
            const result = await createCheckoutOrder(
              { customer, deliveryAddress, ...checkoutInput },
              idempotencyKey,
              customerContext?.actor.id,
              paymentMethod,
            );
            const checkout = buildPayHereCheckout(
              result.order,
              customer,
              deliveryAddress,
            );
            res.status(result.replayed ? 200 : 201).json({
              success: true,
              data: { order: result.order, checkout },
            });
          } catch (error) {
            if (error instanceof ZodError) {
              res.status(400).json({
                success: false,
                message: 'Invalid PayHere checkout request.',
                errors: error.issues,
              });
              return;
            }
            next(error);
          }
        },
      );

      const payHereNotifySchema = z.object({
        merchant_id: z.string(),
        order_id: z.string(),
        payhere_amount: z.string(),
        payhere_currency: z.string(),
        status_code: z.enum(['2', '0', '-1', '-2', '-3']),
        md5sig: z.string(),
        payment_id: z.string().optional(),
      });

      payHereRouter.post('/notify', async (req, res, next) => {
        try {
          const input = payHereNotifySchema.parse(req.body);
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
      res.status(result.replayed ? 200 : 201).json({ success: true, data: result.order });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid COD order request.',
          errors: error.issues,
        });
        return;
      }
      next(error);
    }
  },
);

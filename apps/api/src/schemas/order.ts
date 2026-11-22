import { z } from 'zod';
import { cartLineItemsSchema } from './cart.js';

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^(?:\+94|0)7\d{8}$/, 'Enter a valid Sri Lankan mobile number.'));

const optionalEmailSchema = z
  .union([z.literal(''), z.string().trim().email().max(254)])
  .optional()
  .transform((value) => (value ? value.toLowerCase() : undefined));

const orderNumberSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^TFS-[A-Z0-9]+-[A-F\d]{8}$/));

export const createOrderRequestSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: phoneSchema,
        email: optionalEmailSchema,
      })
      .strict(),
    deliveryAddress: z
      .object({
        line1: z.string().trim().min(5).max(200),
        line2: z.string().trim().max(200).optional(),
        area: z.string().trim().min(2).max(100),
        postalCode: z
          .string()
          .trim()
          .regex(/^\d{5}$/)
          .optional(),
        instructions: z.string().trim().max(300).optional(),
      })
      .strict(),
    items: cartLineItemsSchema,
  })
  .strict();

export const createOrderRequestWithPaymentSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: phoneSchema,
        email: optionalEmailSchema,
      })
      .strict(),
    deliveryAddress: z
      .object({
        line1: z.string().trim().min(5).max(200),
        line2: z.string().trim().max(200).optional(),
        area: z.string().trim().min(2).max(100),
        postalCode: z
          .string()
          .trim()
          .regex(/^\d{5}$/)
          .optional(),
        instructions: z.string().trim().max(300).optional(),
      })
      .strict(),
    items: cartLineItemsSchema,
    paymentMethod: z.enum(['cash-on-delivery', 'payhere']),
  })
  .strict();


export const trackOrderRequestSchema = z
  .object({
    orderNumber: orderNumberSchema,
    phone: phoneSchema,
  })
  .strict();

export const idempotencyKeySchema = z.string().uuid();

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type CreateOrderRequestWithPayment = z.infer<typeof createOrderRequestWithPaymentSchema>;
export type TrackOrderRequest = z.infer<typeof trackOrderRequestSchema>;

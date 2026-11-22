import { z } from 'zod';
import { ORDER_STATUSES } from '../domain/order-status.js';

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const fulfillmentStatusSchema = z.enum(['confirmed', 'processing', 'shipped', 'delivered']);

export const listAdminOrdersQuerySchema = z
  .object({
    cursor: z
      .string()
      .regex(/^\d{13}_[a-f\d]{24}$/i)
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: orderStatusSchema.optional(),
  })
  .strict();

export const orderNumberSchema = z.string().regex(/^TFS-[A-Z0-9]+-[A-F\d]{8}$/);

export const updateOrderStatusSchema = z
  .object({
    status: fulfillmentStatusSchema,
  })
  .strict();

export const cancelOrderSchema = z
  .object({
    reason: z.string().trim().min(5).max(300),
  })
  .strict();

export const markCashReceivedSchema = z
  .object({
    status: z.literal('paid'),
  })
  .strict();

export type AdminOrderStatus = z.infer<typeof orderStatusSchema>;

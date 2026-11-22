import { z } from 'zod';
import { API_URL } from '../catalog/productApi';
import type { CartItem } from '../cart/cartStore';

export interface CODOrderRequest {
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  deliveryAddress: {
    line1: string;
    line2?: string;
    area: string;
    postalCode?: string;
    instructions?: string;
  };
  items: CartItem[];
}

const orderResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    orderNumber: z.string(),
    status: z.string(),
    paymentMethod: z.literal('cash-on-delivery'),
    paymentStatus: z.literal('unpaid'),
    currency: z.literal('LKR'),
    subtotalLkr: z.number().int().nonnegative(),
    deliveryFeeLkr: z.number().int().nonnegative(),
    totalLkr: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
  }),
});

const errorResponseSchema = z.object({
  message: z.string().optional(),
});

export type CODOrderConfirmation = z.infer<typeof orderResponseSchema>['data'];

export async function placeCODOrder(request: CODOrderRequest, idempotencyKey: string) {
  const response = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(request),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(payload);
    throw new Error(
      errorResponse.success && errorResponse.data.message
        ? errorResponse.data.message
        : `Unable to place the order (HTTP ${response.status}).`,
    );
  }

  const result = orderResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error('The order confirmation returned an invalid response.');
  }
  return result.data.data;
}

const payHereCheckoutResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    order: orderResponseSchema.shape.data.extend({
      paymentMethod: z.literal('payhere'),
    }),
    checkout: z.object({
      actionUrl: z.string().url(),
      fields: z.record(z.string(), z.string()),
    }),
  }),
});

export async function placePayHereOrder(request: CODOrderRequest, idempotencyKey: string) {
  const response = await fetch(`${API_URL}/orders/payhere/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ ...request, paymentMethod: 'payhere' }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(payload);
    throw new Error(
      errorResponse.success && errorResponse.data.message
        ? errorResponse.data.message
        : `Unable to start PayHere checkout (HTTP ${response.status}).`,
    );
  }
  const result = payHereCheckoutResponseSchema.safeParse(payload);
  if (!result.success) throw new Error('The PayHere checkout returned an invalid response.');
  return result.data.data;
}

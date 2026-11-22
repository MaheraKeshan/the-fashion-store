import { z } from 'zod';
import { API_URL } from '../catalog/productApi';

const trackedOrderSchema = z.object({
  orderNumber: z.string(),
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const trackingResponseSchema = z.object({
  success: z.literal(true),
  data: trackedOrderSchema,
});

const errorResponseSchema = z.object({
  message: z.string().optional(),
});

export type TrackedOrder = z.infer<typeof trackedOrderSchema>;

export async function trackOrder(orderNumber: string, phone: string) {
  const response = await fetch(`${API_URL}/orders/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber, phone }),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(payload);
    throw new Error(
      errorResponse.success && errorResponse.data.message
        ? errorResponse.data.message
        : `Unable to look up this order (HTTP ${response.status}).`,
    );
  }

  const result = trackingResponseSchema.safeParse(payload);
  if (!result.success) throw new Error('Order tracking returned an invalid response.');
  return result.data.data;
}

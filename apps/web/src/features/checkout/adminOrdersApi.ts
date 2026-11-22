import { z } from 'zod';
import { API_URL } from '../catalog/productApi';

const orderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]);
const fulfillmentStatusSchema = z.enum(['confirmed', 'processing', 'shipped', 'delivered']);

const orderSchema = z.object({
  orderNumber: z.string(),
  customer: z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string().optional(),
  }),
  deliveryAddress: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    area: z.string(),
    postalCode: z.string().optional(),
    instructions: z.string().optional(),
  }),
  items: z.array(
    z.object({
      variantId: z.string(),
      productName: z.string(),
      productSlug: z.string(),
      sku: z.string(),
      size: z.string(),
      color: z.string(),
      quantity: z.number().int().positive(),
      unitPriceLkr: z.number().int().nonnegative(),
      lineTotalLkr: z.number().int().nonnegative(),
    }),
  ),
  currency: z.literal('LKR'),
  subtotalLkr: z.number().int().nonnegative(),
  deliveryFeeLkr: z.number().int().nonnegative(),
  totalLkr: z.number().int().nonnegative(),
  paymentMethod: z.enum(['cash-on-delivery', 'payhere']),
  paymentStatus: z.enum(['unpaid', 'paid', 'refunded']),
  status: orderStatusSchema,
  cancellation: z
    .object({
      reason: z.string(),
      cancelledAt: z.string().datetime(),
      cancelledBy: z.string(),
    })
    .optional(),
  canCancel: z.boolean(),
  canMarkCashReceived: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  nextStatuses: z.array(fulfillmentStatusSchema),
});

const errorResponseSchema = z.object({
  message: z.string().optional(),
});

const adminOrdersResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    orders: z.array(orderSchema),
    nextCursor: z.string().nullable(),
    limit: z.number().int().positive(),
  }),
});

const adminOrderResponseSchema = z.object({
  success: z.literal(true),
  data: orderSchema,
});

export type AdminOrder = z.infer<typeof orderSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>;

async function readResponse(response: Response, fallback: string) {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(payload);
    throw new Error(
      errorResponse.success && errorResponse.data.message
        ? errorResponse.data.message
        : `${fallback} (HTTP ${response.status}).`,
    );
  }
  return payload;
}

export async function fetchAdminOrders(
  options: { cursor?: string; status?: OrderStatus; signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams({ limit: '20' });
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.status) params.set('status', options.status);
  const response = await fetch(`${API_URL}/admin/orders?${params.toString()}`, {
    credentials: 'include',
    signal: options.signal,
  });
  const payload = await readResponse(response, 'Unable to load orders');
  const result = adminOrdersResponseSchema.safeParse(payload);
  if (!result.success) throw new Error('The order list returned an invalid response.');
  return result.data.data;
}

export async function updateAdminOrderStatus(
  csrfToken: string,
  orderNumber: string,
  status: FulfillmentStatus,
) {
  const response = await fetch(
    `${API_URL}/admin/orders/${encodeURIComponent(orderNumber)}/status`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ status }),
    },
  );
  const payload = await readResponse(response, 'Unable to update order status');
  const result = adminOrderResponseSchema.safeParse(payload);
  if (!result.success) throw new Error('The updated order returned an invalid response.');
  return result.data.data;
}

export async function cancelAdminOrder(csrfToken: string, orderNumber: string, reason: string) {
  const response = await fetch(
    `${API_URL}/admin/orders/${encodeURIComponent(orderNumber)}/cancel`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ reason }),
    },
  );
  const payload = await readResponse(response, 'Unable to cancel order');
  const result = adminOrderResponseSchema.safeParse(payload);
  if (!result.success) throw new Error('The cancelled order returned an invalid response.');
  return result.data.data;
}

export async function markCashReceived(csrfToken: string, orderNumber: string) {
  const response = await fetch(
    `${API_URL}/admin/orders/${encodeURIComponent(orderNumber)}/payment-status`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ status: 'paid' }),
    },
  );
  const payload = await readResponse(response, 'Unable to record cash collection');
  const result = adminOrderResponseSchema.safeParse(payload);
  if (!result.success) throw new Error('The payment update returned an invalid response.');
  return result.data.data;
}

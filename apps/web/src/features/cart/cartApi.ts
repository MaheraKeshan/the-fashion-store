import { z } from 'zod';
import { API_URL } from '../catalog/productApi';
import type { CartItem } from './cartStore';

const cartQuoteSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(
      z.object({
        variantId: z.string(),
        quantity: z.number().int().positive(),
        product: z
          .object({
            name: z.string(),
            slug: z.string(),
            image: z.object({ url: z.string(), alt: z.string() }).nullable(),
          })
          .nullable(),
        variant: z.object({ size: z.string(), color: z.string() }).nullable(),
        available: z.boolean(),
        availableQuantity: z.number().int().nonnegative(),
        unitPrice: z.number().int().nonnegative().nullable(),
        lineTotal: z.number().int().nonnegative().nullable(),
      }),
    ),
    subtotal: z.number().int().nonnegative().nullable(),
  }),
});

const errorResponseSchema = z.object({
  message: z.string().optional(),
});

export async function fetchCartQuote(items: CartItem[]) {
  const response = await fetch(`${API_URL}/cart/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(payload);
    throw new Error(
      errorResponse.success && errorResponse.data.message
        ? errorResponse.data.message
        : `Unable to validate your shopping bag (HTTP ${response.status}).`,
    );
  }

  const result = cartQuoteSchema.safeParse(payload);
  if (!result.success) {
    throw new Error('The shopping bag quote returned an invalid response.');
  }
  return result.data.data;
}

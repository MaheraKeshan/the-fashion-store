import { z } from 'zod';

const cartItemSchema = z
  .object({
    variantId: z.string().regex(/^[0-9a-f]{24}$/i, 'Expected a MongoDB ObjectId.'),
    quantity: z.number().int().min(1).max(99),
  })
  .strict();

const uniqueCartItemsSchema = z
  .array(cartItemSchema)
  .max(50)
  .refine(
    (items) => new Set(items.map((item) => item.variantId.toLowerCase())).size === items.length,
    {
      message: 'Cart items must have unique variant IDs.',
    },
  );

export const cartLineItemsSchema = uniqueCartItemsSchema.min(1);
export const customerCartUpdateSchema = z
  .object({ items: uniqueCartItemsSchema })
  .strict();

export const cartQuoteRequestSchema = z.object({ items: cartLineItemsSchema }).strict();

export type CartQuoteItemInput = z.infer<typeof cartItemSchema>;

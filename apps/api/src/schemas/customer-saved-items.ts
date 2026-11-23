import { z } from 'zod';

const productIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'Expected a MongoDB ObjectId.');

export const customerWishlistUpdateSchema = z
  .object({
    productIds: z
      .array(productIdSchema)
      .max(100)
      .refine(
        (productIds) =>
          new Set(productIds.map((id) => id.toLowerCase())).size === productIds.length,
        { message: 'Wishlist products must have unique IDs.' },
      ),
  })
  .strict();

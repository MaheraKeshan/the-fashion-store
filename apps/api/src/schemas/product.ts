import { z } from 'zod';

const genderSchema = z.enum(['women', 'men', 'kids', 'unisex']);
const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'Expected a MongoDB ObjectId.');

export const listProductsQuerySchema = z
  .object({
    gender: genderSchema.optional(),
    categoryId: objectIdSchema.optional(),
    collection: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    size: z.string().trim().min(1).max(30).optional(),
    color: z.string().trim().min(1).max(50).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(24),
    sort: z.enum(['newest', 'price-asc', 'price-desc']).default('newest'),
  })
  .strict()
  .refine(
    ({ minPrice, maxPrice }) =>
      minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice.', path: ['minPrice'] },
  );

export const productSlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(150),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

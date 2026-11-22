import { z } from 'zod';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1';

const productSchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  category: z.object({ _id: z.string(), name: z.string(), slug: z.string() }),
  collections: z.array(z.object({ _id: z.string(), name: z.string(), slug: z.string() })),
  gender: z.enum(['women', 'men', 'kids', 'unisex']),
  tags: z.array(z.string()),
  images: z.array(z.object({ url: z.string(), alt: z.string() })),
  brand: z.string().optional(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  variants: z
    .array(
      z.object({
        _id: z.string(),
        sku: z.string(),
        size: z.string(),
        color: z.string(),
        price: z.number().int().nonnegative(),
        compareAtPrice: z.number().int().nonnegative().optional(),
        stockQuantity: z.number().int().nonnegative(),
        isActive: z.boolean(),
      }),
    )
    .min(1),
});

const productListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(productSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

const errorResponseSchema = z.object({
  message: z.string().optional(),
});

export type Product = z.infer<typeof productSchema>;
export type ProductGender = Product['gender'];
export type ProductSort = 'newest' | 'price-asc' | 'price-desc';

export interface ProductListFilters {
  gender?: ProductGender;
  isPlusSize?: boolean;
  search?: string;
  size?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
}

const productDetailResponseSchema = z.object({
  success: z.literal(true),
  data: productSchema,
});

export async function fetchProducts(filters: ProductListFilters, page = 1) {
  const params = new URLSearchParams({
    limit: '24',
    page: String(page),
    sort: filters.sort ?? 'newest',
  });
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.isPlusSize) params.set('collection', 'plus-size');
  if (filters.search) params.set('q', filters.search);
  if (filters.size) params.set('size', filters.size);
  if (filters.color) params.set('color', filters.color);
  if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));

  const response = await fetch(`${API_URL}/products?${params.toString()}`);
  const payload: unknown = await response.json();

  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(payload);
    throw new Error(
      errorResponse.success && errorResponse.data.message
        ? errorResponse.data.message
        : `Unable to load products (HTTP ${response.status}).`,
    );
  }

  const result = productListResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error('The product catalogue returned an invalid response.');
  }

  return result.data;
}

export async function fetchProductBySlug(slug: string) {
  const response = await fetch(`${API_URL}/products/${encodeURIComponent(slug)}`);
  const payload: unknown = await response.json();

  if (!response.ok) {
    const errorResponse = errorResponseSchema.safeParse(payload);
    throw new Error(
      errorResponse.success && errorResponse.data.message
        ? errorResponse.data.message
        : `Unable to load this product (HTTP ${response.status}).`,
    );
  }

  const result = productDetailResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error('The product details returned an invalid response.');
  }

  return result.data.data;
}

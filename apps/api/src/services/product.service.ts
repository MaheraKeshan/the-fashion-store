import { Types, type FilterQuery, type PipelineStage } from 'mongoose';
import { Category } from '../models/category.js';
import { Collection } from '../models/collection.js';
import { Product } from '../models/product.js';
import { ProductVariant } from '../models/product-variant.js';
import type { ListProductsQuery } from '../schemas/product.js';
import { getDatabaseStatus } from '../config/database.js';

type ProductFilter = FilterQuery<typeof Product>;

interface CatalogVariant {
  _id: Types.ObjectId;
  sku: string;
  size: string;
  color: string;
  price: number;
  compareAtPrice?: number;
  stockQuantity: number;
  isActive: boolean;
}

interface CatalogCategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
}

interface CatalogCollection {
  _id: Types.ObjectId;
  name: string;
  slug: string;
}

interface CatalogProduct {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  category: CatalogCategory;
  collections: CatalogCollection[];
  gender: 'women' | 'men' | 'kids' | 'unisex';
  tags: string[];
  images: { url: string; alt: string }[];
  brand?: string;
  isActive: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
  variants: CatalogVariant[];
  startingPrice: number;
}

export class ProductServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ProductServiceError';
  }
}

function assertDatabaseConnected() {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('The product catalogue is temporarily unavailable.', 503);
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCatalogPipeline(
  productFilter: ProductFilter,
  query?: Pick<ListProductsQuery, 'size' | 'color' | 'minPrice' | 'maxPrice'>,
): PipelineStage[] {
  const variantFilter: Record<string, unknown> = {
    $expr: { $eq: ['$productId', '$$productId'] },
    isActive: true,
  };
  if (query?.size) variantFilter.size = new RegExp(`^${escapeRegex(query.size)}$`, 'i');
  if (query?.color) variantFilter.color = new RegExp(`^${escapeRegex(query.color)}$`, 'i');
  if (query?.minPrice !== undefined || query?.maxPrice !== undefined) {
    variantFilter.price = {
      ...(query.minPrice !== undefined && { $gte: query.minPrice }),
      ...(query.maxPrice !== undefined && { $lte: query.maxPrice }),
    };
  }

  return [
    { $match: productFilter },
    {
      $lookup: {
        from: ProductVariant.collection.name,
        let: { productId: '$_id' },
        pipeline: [
          { $match: variantFilter },
          {
            $project: {
              _id: 1,
              sku: 1,
              size: 1,
              color: 1,
              price: 1,
              compareAtPrice: 1,
              stockQuantity: 1,
              isActive: 1,
            },
          },
        ],
        as: 'variants',
      },
    },
    { $match: { 'variants.0': { $exists: true } } },
    {
      $lookup: {
        from: Category.collection.name,
        localField: 'categoryId',
        foreignField: '_id',
        pipeline: [{ $match: { isActive: true } }, { $project: { _id: 1, name: 1, slug: 1 } }],
        as: 'category',
      },
    },
    { $unwind: '$category' },
    {
      $lookup: {
        from: Collection.collection.name,
        localField: 'collectionIds',
        foreignField: '_id',
        pipeline: [{ $match: { isActive: true } }, { $project: { _id: 1, name: 1, slug: 1 } }],
        as: 'collections',
      },
    },
    { $addFields: { startingPrice: { $min: '$variants.price' } } },
  ];
}

export async function listProducts(query: ListProductsQuery) {
  assertDatabaseConnected();

  const filter: ProductFilter = { isActive: true };
  if (query.gender) filter.gender = query.gender;
  if (query.categoryId) filter.categoryId = new Types.ObjectId(query.categoryId);
  if (query.collection) {
    const collection = await Collection.findOne({ slug: query.collection, isActive: true })
      .select('_id')
      .lean()
      .exec();
    if (!collection) {
      return {
        products: [],
        pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
      };
    }
    filter.collectionIds = collection._id;
  }
  if (query.q) {
    const search = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: search }, { description: search }, { tags: search }, { brand: search }];
  }

  const basePipeline = buildCatalogPipeline(filter, query);
  const sort: Record<string, 1 | -1> =
    query.sort === 'price-asc'
      ? { startingPrice: 1, _id: 1 }
      : query.sort === 'price-desc'
        ? { startingPrice: -1, _id: 1 }
        : { createdAt: -1, _id: -1 };
  const [result] = await Product.aggregate<{
    products: CatalogProduct[];
    totals: { total: number }[];
  }>([
    ...basePipeline,
    {
      $facet: {
        products: [
          { $sort: sort },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
          { $project: { startingPrice: 0 } },
        ],
        totals: [{ $count: 'total' }],
      },
    },
  ]).exec();
  const total = result?.totals[0]?.total ?? 0;

  return {
    products: result?.products ?? [],
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getProductBySlug(slug: string) {
  assertDatabaseConnected();

  const [product] = await Product.aggregate<CatalogProduct>(
    buildCatalogPipeline({ slug, isActive: true }),
  ).exec();
  if (!product) {
    throw new ProductServiceError('Product not found.', 404);
  }
  return product;
}

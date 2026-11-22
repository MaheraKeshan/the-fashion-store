import { Types } from 'mongoose';
import { Category } from '../models/category.js';
import { Product } from '../models/product.js';
import { ProductVariant } from '../models/product-variant.js';
import type { CartQuoteItemInput } from '../schemas/cart.js';
import { getDatabaseStatus } from '../config/database.js';
import { ProductServiceError } from './product.service.js';

export async function quoteCart(items: CartQuoteItemInput[]) {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('The shopping bag is temporarily unavailable.', 503);
  }

  const variantIds = items.map((item) => new Types.ObjectId(item.variantId));
  const variants = await ProductVariant.find({ _id: { $in: variantIds } })
    .select('_id productId size color price stockQuantity isActive')
    .lean()
    .exec();
  const productIds = [...new Set(variants.map((variant) => variant.productId.toString()))].map(
    (id) => new Types.ObjectId(id),
  );
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
        .select('_id name slug images categoryId isActive')
        .lean()
        .exec()
    : [];
  const categoryIds = [...new Set(products.map((product) => product.categoryId.toString()))].map(
    (id) => new Types.ObjectId(id),
  );
  const categories = categoryIds.length
    ? await Category.find({ _id: { $in: categoryIds } })
        .select('_id isActive')
        .lean()
        .exec()
    : [];

  const variantsById = new Map(variants.map((variant) => [variant._id.toString(), variant]));
  const productsById = new Map(products.map((product) => [product._id.toString(), product]));
  const activeCategoryIds = new Set(
    categories.filter((category) => category.isActive).map((category) => category._id.toString()),
  );

  const quotedItems = items.map(({ variantId, quantity }) => {
    const variant = variantsById.get(variantId.toLowerCase());
    const product = variant ? productsById.get(variant.productId.toString()) : undefined;
    const isPurchasable =
      variant?.isActive === true &&
      product?.isActive === true &&
      activeCategoryIds.has(product.categoryId.toString());
    const availableQuantity = isPurchasable ? variant.stockQuantity : 0;
    const unitPrice = isPurchasable ? variant.price : null;
    const lineTotal =
      isPurchasable &&
      quantity <= availableQuantity &&
      Number.isSafeInteger(variant.price * quantity)
        ? variant.price * quantity
        : null;

    return {
      variantId,
      quantity,
      product: product
        ? {
            name: product.name,
            slug: product.slug,
            image: product.images[0] ?? null,
          }
        : null,
      variant: variant ? { size: variant.size, color: variant.color } : null,
      available: lineTotal !== null,
      availableQuantity,
      unitPrice,
      lineTotal,
    };
  });
  const subtotal =
    quotedItems.every((item) => item.available) &&
    Number.isSafeInteger(quotedItems.reduce((total, item) => total + (item.lineTotal ?? 0), 0))
      ? quotedItems.reduce((total, item) => total + (item.lineTotal ?? 0), 0)
      : null;

  return { items: quotedItems, subtotal };
}

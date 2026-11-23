import { Types } from 'mongoose';
import { getDatabaseStatus } from '../config/database.js';
import { Customer } from '../models/customer.js';
import { Product } from '../models/product.js';
import type { CartQuoteItemInput } from '../schemas/cart.js';
import { ProductServiceError } from './product.service.js';
import { quoteCart } from './cart.service.js';

function assertDatabaseConnected() {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('Saved items are temporarily unavailable.', 503);
  }
}

function quoteSavedCart(items: CartQuoteItemInput[]) {
  return items.length > 0 ? quoteCart(items) : Promise.resolve({ items: [], subtotal: 0 });
}

export async function getCustomerCart(customerId: string) {
  assertDatabaseConnected();
  const customer = await Customer.findOne({ _id: customerId, isActive: true })
    .select('+cartItems')
    .lean()
    .exec();
  if (!customer) throw new ProductServiceError('Customer account could not be found.', 404);

  const items = (customer.cartItems ?? []).map(({ variantId, quantity }) => ({
    variantId: variantId.toString(),
    quantity,
  }));
  return quoteSavedCart(items);
}

export async function replaceCustomerCart(customerId: string, items: CartQuoteItemInput[]) {
  assertDatabaseConnected();
  const customer = await Customer.findOneAndUpdate(
    { _id: customerId, isActive: true },
    {
      $set: {
        cartItems: items.map(({ variantId, quantity }) => ({
          variantId: new Types.ObjectId(variantId),
          quantity,
        })),
      },
    },
    { new: true, runValidators: true },
  )
    .select('+cartItems')
    .lean()
    .exec();
  if (!customer) throw new ProductServiceError('Customer account could not be found.', 404);

  const savedItems = (customer.cartItems ?? []).map(({ variantId, quantity }) => ({
    variantId: variantId.toString(),
    quantity,
  }));
  return quoteSavedCart(savedItems);
}

export async function getCustomerWishlist(customerId: string) {
  assertDatabaseConnected();
  const customer = await Customer.findOne({ _id: customerId, isActive: true })
    .select('+wishlistProductIds')
    .lean()
    .exec();
  if (!customer) throw new ProductServiceError('Customer account could not be found.', 404);

  const productIds = customer.wishlistProductIds ?? [];
  if (productIds.length === 0) return { items: [] };

  const products = await Product.find({ _id: { $in: productIds }, isActive: true })
    .select('_id slug')
    .lean()
    .exec();
  const productsById = new Map(products.map((product) => [product._id.toString(), product.slug]));
  return {
    items: productIds.flatMap((productId) => {
      const id = productId.toString();
      const slug = productsById.get(id);
      return slug ? [{ productId: id, slug }] : [];
    }),
  };
}

export async function replaceCustomerWishlist(customerId: string, productIds: string[]) {
  assertDatabaseConnected();
  const ids = productIds.map((productId) => new Types.ObjectId(productId));
  if (ids.length > 0) {
    const activeProductCount = await Product.countDocuments({
      _id: { $in: ids },
      isActive: true,
    }).exec();
    if (activeProductCount !== ids.length) {
      throw new ProductServiceError('One or more wishlist products are unavailable.', 422);
    }
  }

  const customer = await Customer.findOneAndUpdate(
    { _id: customerId, isActive: true },
    { $set: { wishlistProductIds: ids } },
    { new: true, runValidators: true },
  )
    .select('_id')
    .lean()
    .exec();
  if (!customer) throw new ProductServiceError('Customer account could not be found.', 404);

  return getCustomerWishlist(customerId);
}

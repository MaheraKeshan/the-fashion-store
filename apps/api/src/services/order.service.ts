import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { phoneNumbersMatch } from '../domain/phone.js';
import { Category } from '../models/category.js';
import { Order } from '../models/order.js';
import { Product } from '../models/product.js';
import { ProductVariant } from '../models/product-variant.js';
import { StoreSettings } from '../models/store-settings.js';
import { getDatabaseStatus } from '../config/database.js';
import type { CreateOrderRequest } from '../schemas/order.js';
import { ProductServiceError } from './product.service.js';
import { getStoreSettings } from './store-settings.service.js';

interface OrderSummary {
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  currency: 'LKR';
  subtotalLkr: number;
  deliveryFeeLkr: number;
  totalLkr: number;
  createdAt: string;
}

export function createOrderRequestHash(
  input: CreateOrderRequest,
  customerId?: string,
  paymentMethod: 'cash-on-delivery' | 'payhere' = 'cash-on-delivery',
): string {
  const canonical = {
    customerId: customerId ?? null,
    paymentMethod,
    customer: {
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email ?? null,
    },
    deliveryAddress: {
      line1: input.deliveryAddress.line1,
      line2: input.deliveryAddress.line2 ?? null,
      area: input.deliveryAddress.area,
      postalCode: input.deliveryAddress.postalCode ?? null,
      instructions: input.deliveryAddress.instructions ?? null,
    },
    items: [...input.items]
      .sort((left, right) => left.variantId.localeCompare(right.variantId))
      .map((item) => ({ variantId: item.variantId.toLowerCase(), quantity: item.quantity })),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function ensureIdempotencyRequestMatches(
  order: { requestHash?: string | null },
  requestHash: string,
) {
  if (!order.requestHash) return;
  if (order.requestHash !== requestHash) {
    throw new ProductServiceError(
      'This idempotency key was already used for a different checkout request.',
      409,
    );
  }
}

export async function createCashOnDeliveryOrder(
  input: CreateOrderRequest,
  idempotencyKey: string,
  customerId?: string,
) {
  return createCheckoutOrder(input, idempotencyKey, customerId, 'cash-on-delivery');
}

export async function createCheckoutOrder(
  input: CreateOrderRequest,
  idempotencyKey: string,
  customerId: string | undefined,
  paymentMethod: 'cash-on-delivery' | 'payhere',
) {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('Order placement is temporarily unavailable.', 503);
  }
  const existingOrder = await Order.findOne({ idempotencyKey }).lean().exec();
  const requestHash = createOrderRequestHash(input, customerId, paymentMethod);
  if (existingOrder) {
    ensureIdempotencyRequestMatches(existingOrder, requestHash);
    return { order: toOrderSummary(existingOrder), replayed: true };
  }

  await getStoreSettings();
  const session = await mongoose.startSession();
  let orderSummary: OrderSummary | null = null;
  let replayed = false;
  const orderNumber = `TFS-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;

  try {
    await session.withTransaction(async () => {
      const currentOrder = await Order.findOne({ idempotencyKey }).session(session).exec();
      if (currentOrder) {
        ensureIdempotencyRequestMatches(currentOrder, requestHash);
        orderSummary = toOrderSummary(currentOrder);
        replayed = true;
        return;
      }

      const settings = await StoreSettings.findOne({ storeKey: 'default' })
        .session(session)
        .lean()
        .exec();
      if (!settings?.deliveryConfirmed) {
        throw new ProductServiceError(
          'COD order placement is disabled until delivery settings are confirmed.',
          503,
        );
      }

      const configuredArea = settings.coveredAreas.find(
        (area) =>
          area.toLocaleLowerCase('en') === input.deliveryAddress.area.toLocaleLowerCase('en'),
      );
      if (!configuredArea) {
        throw new ProductServiceError('Delivery is not available in the selected area.', 422);
      }

      const deliveryFeeLkr =
        settings.deliveryPricingMethod === 'flat'
          ? settings.deliveryFeeLkr
          : settings.deliveryAreaFees.find(
              (entry) =>
                entry.area.toLocaleLowerCase('en') === configuredArea.toLocaleLowerCase('en'),
            )?.feeLkr;
      if (
        typeof deliveryFeeLkr !== 'number' ||
        !Number.isSafeInteger(deliveryFeeLkr) ||
        deliveryFeeLkr < 0
      ) {
        throw new ProductServiceError('A valid delivery fee is not configured for this area.', 503);
      }

      const variantIds = input.items.map((item) => new Types.ObjectId(item.variantId));
      const variants = await ProductVariant.find({ _id: { $in: variantIds }, isActive: true })
        .session(session)
        .lean()
        .exec();
      if (variants.length !== input.items.length) {
        throw new ProductServiceError(
          'One or more selected variants are no longer available.',
          409,
        );
      }
      const variantsById = new Map(variants.map((variant) => [variant._id.toString(), variant]));
      const productIds = [...new Set(variants.map((variant) => variant.productId.toString()))].map(
        (id) => new Types.ObjectId(id),
      );
      const products = await Product.find({ _id: { $in: productIds }, isActive: true })
        .select('_id name slug categoryId')
        .session(session)
        .lean()
        .exec();
      const productsById = new Map(products.map((product) => [product._id.toString(), product]));
      const categoryIds = [
        ...new Set(products.map((product) => product.categoryId.toString())),
      ].map((id) => new Types.ObjectId(id));
      const activeCategories = await Category.find({
        _id: { $in: categoryIds },
        isActive: true,
      })
        .select('_id')
        .session(session)
        .lean()
        .exec();
      const activeCategoryIds = new Set(
        activeCategories.map((category) => category._id.toString()),
      );

      const orderItems = input.items.map(({ variantId, quantity }) => {
        const variant = variantsById.get(variantId.toLowerCase());
        const product = variant ? productsById.get(variant.productId.toString()) : undefined;
        if (
          !variant ||
          !product ||
          !activeCategoryIds.has(product.categoryId.toString()) ||
          variant.stockQuantity < quantity
        ) {
          throw new ProductServiceError(
            'One or more items are unavailable or no longer have enough stock.',
            409,
          );
        }

        const lineTotalLkr = variant.price * quantity;
        if (!Number.isSafeInteger(lineTotalLkr)) {
          throw new ProductServiceError('The order total is outside the supported range.', 422);
        }

        return {
          variantId: variant._id,
          productName: product.name,
          productSlug: product.slug,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          quantity,
          unitPriceLkr: variant.price,
          lineTotalLkr,
        };
      });

      const subtotalLkr = orderItems.reduce((total, item) => total + item.lineTotalLkr, 0);
      const totalLkr = subtotalLkr + deliveryFeeLkr;
      if (!Number.isSafeInteger(subtotalLkr) || !Number.isSafeInteger(totalLkr)) {
        throw new ProductServiceError('The order total is outside the supported range.', 422);
      }

      const order = new Order({
        orderNumber,
        idempotencyKey,
        requestHash,
        ...(customerId && { customerId: new Types.ObjectId(customerId) }),
        customer: input.customer,
        deliveryAddress: {
          ...input.deliveryAddress,
          area: configuredArea,
        },
        items: orderItems,
        currency: 'LKR',
        subtotalLkr,
        deliveryFeeLkr,
        totalLkr,
        paymentMethod,
        paymentStatus: 'unpaid',
        status: 'pending',
      });
      await order.save({ session });

      for (const item of input.items) {
        const result = await ProductVariant.updateOne(
          {
            _id: new Types.ObjectId(item.variantId),
            isActive: true,
            stockQuantity: { $gte: item.quantity },
          },
          { $inc: { stockQuantity: -item.quantity } },
          { session },
        ).exec();
        if (result.modifiedCount !== 1) {
          throw new ProductServiceError(
            'Stock changed while placing your order. Please review your bag.',
            409,
          );
        }
      }

      orderSummary = toOrderSummary(order);
    });
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      throw new ProductServiceError(
        'Order placement requires MongoDB replica set transactions.',
        503,
      );
    }
    if (isDuplicateKeyError(error)) {
      const duplicateOrder = await Order.findOne({ idempotencyKey }).lean().exec();
      if (duplicateOrder) {
        ensureIdempotencyRequestMatches(duplicateOrder, requestHash);
        return { order: toOrderSummary(duplicateOrder), replayed: true };
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!orderSummary) {
    throw new ProductServiceError('The order could not be completed.', 500);
  }
  return { order: orderSummary, replayed };
}

export async function trackCODOrder(orderNumber: string, phone: string) {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('Order tracking is temporarily unavailable.', 503);
  }

  const order = await Order.findOne({ orderNumber })
    .select('orderNumber status createdAt updatedAt customer.phone')
    .lean()
    .exec();
  if (!order || !order.customer?.phone || !phoneNumbersMatch(order.customer.phone, phone)) {
    throw new ProductServiceError('Order details could not be verified.', 404);
  }

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

interface CustomerOrderCursor {
  createdAt: Date;
  id: Types.ObjectId;
}

function decodeCustomerOrderCursor(cursor: string): CustomerOrderCursor {
  const [timestamp, id] = cursor.split('_');
  const milliseconds = Number(timestamp);
  if (
    !/^\d{13}$/.test(timestamp ?? '') ||
    !/^[a-f\d]{24}$/i.test(id ?? '') ||
    !Number.isSafeInteger(milliseconds)
  ) {
    throw new ProductServiceError('The order page cursor is invalid.', 400);
  }
  return { createdAt: new Date(milliseconds), id: new Types.ObjectId(id) };
}

export async function listCustomerOrders(
  customerId: string,
  cursor?: string,
  limit = 20,
) {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('Order history is temporarily unavailable.', 503);
  }
  const customerObjectId = new Types.ObjectId(customerId);
  const filter: Record<string, unknown> = { customerId: customerObjectId };
  if (cursor) {
    const decoded = decodeCustomerOrderCursor(cursor);
    filter.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
    ];
  }

  const orders = await Order.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .select(
      'orderNumber status paymentMethod paymentStatus currency subtotalLkr deliveryFeeLkr totalLkr createdAt',
    )
    .lean()
    .exec();
  const page = orders.slice(0, limit);
  const nextCursor =
    orders.length > limit
      ? `${page[page.length - 1].createdAt.getTime()}_${page[page.length - 1]._id.toString()}`
      : undefined;

  return {
    data: page.map((order) => ({
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      subtotalLkr: order.subtotalLkr,
      deliveryFeeLkr: order.deliveryFeeLkr,
      totalLkr: order.totalLkr,
      createdAt: order.createdAt.toISOString(),
    })),
    nextCursor,
  };
}

function toOrderSummary(order: {
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  currency: 'LKR';
  subtotalLkr: number;
  deliveryFeeLkr: number;
  totalLkr: number;
  createdAt: Date;
}): OrderSummary {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    currency: order.currency,
    subtotalLkr: order.subtotalLkr,
    deliveryFeeLkr: order.deliveryFeeLkr,
    totalLkr: order.totalLkr,
    createdAt: order.createdAt.toISOString(),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function isTransactionUnsupportedError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 20;
}

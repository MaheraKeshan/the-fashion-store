import mongoose, { Types } from 'mongoose';
import { getDatabaseStatus } from '../config/database.js';
import {
  canAdvanceOrderStatus,
  canCancelOrder,
  canMarkCashReceived,
  getNextOrderStatuses,
  type OrderStatus,
  type PaymentStatus,
} from '../domain/order-status.js';
import { AdminAuditEvent } from '../models/admin-audit-event.js';
import { Order } from '../models/order.js';
import { ProductVariant } from '../models/product-variant.js';
import { ProductServiceError } from './product.service.js';

const adminOrderProjection =
  'orderNumber customer deliveryAddress items currency subtotalLkr deliveryFeeLkr totalLkr paymentMethod paymentStatus status cancellation createdAt updatedAt';

interface AdminOrderCursor {
  createdAt: Date;
  id: Types.ObjectId;
}

function decodeCursor(cursor: string): AdminOrderCursor {
  const [timestamp, id] = cursor.split('_');
  const createdAt = new Date(Number(timestamp));
  if (!Number.isFinite(createdAt.getTime()) || !Types.ObjectId.isValid(id)) {
    throw new ProductServiceError('The order page cursor is invalid.', 400);
  }
  return { createdAt, id: new Types.ObjectId(id) };
}

export async function listAdminOrders(input: {
  cursor?: string;
  limit: number;
  status?: OrderStatus;
}) {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('Order management is temporarily unavailable.', 503);
  }

  const filter: Record<string, unknown> = {};
  if (input.status) filter.status = input.status;
  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ];
  }

  const results = await Order.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(input.limit + 1)
    .select(adminOrderProjection)
    .lean()
    .exec();
  const hasMore = results.length > input.limit;
  const pageOrders = results.slice(0, input.limit);
  const orders = pageOrders.map(toAdminOrder);
  const lastOrder = pageOrders.at(-1);
  const nextCursor =
    hasMore && lastOrder
      ? `${new Date(lastOrder.createdAt).getTime()}_${lastOrder._id.toString()}`
      : null;

  return { orders, nextCursor, limit: input.limit };
}

export async function updateAdminOrderStatus(
  orderNumber: string,
  nextStatus: OrderStatus,
  actorUserId: string,
) {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('Order management is temporarily unavailable.', 503);
  }

  const session = await mongoose.startSession();
  try {
    const updatedOrder = await session.withTransaction(async () => {
      const order = await Order.findOne({ orderNumber })
        .select('_id status paymentMethod paymentStatus')
        .session(session)
        .lean()
        .exec();
      if (!order) throw new ProductServiceError('The order was not found.', 404);
      const currentStatus = order.status as OrderStatus;
      if (currentStatus === nextStatus) {
        const currentOrder = await Order.findById(order._id)
          .select(adminOrderProjection)
          .session(session)
          .lean()
          .exec();
        if (!currentOrder) throw new ProductServiceError('The order was not found.', 404);
        return currentOrder;
      }
      if (
        !canAdvanceOrderStatus(currentStatus, nextStatus, order.paymentMethod, order.paymentStatus)
      ) {
        if (
          currentStatus === 'confirmed' &&
          nextStatus === 'processing' &&
          order.paymentMethod === 'payhere' &&
          order.paymentStatus !== 'paid'
        ) {
          throw new ProductServiceError('PayHere orders must be paid before processing.', 409);
        }
        throw new ProductServiceError(
          `An order cannot move from ${currentStatus} to ${nextStatus}.`,
          409,
        );
      }

      const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: currentStatus },
        { $set: { status: nextStatus } },
        { new: true, runValidators: true, session },
      )
        .select(adminOrderProjection)
        .lean()
        .exec();
      if (!updated) {
        throw new ProductServiceError(
          'The order changed; refresh the order queue and try again.',
          409,
        );
      }

      if (currentStatus !== nextStatus) {
        await AdminAuditEvent.create(
          [
            {
              actorUserId,
              action: 'order.status.updated',
              resourceType: 'order',
              resourceId: orderNumber,
              before: { status: currentStatus },
              after: { status: nextStatus },
            },
          ],
          { session },
        );
      }
      return updated;
    });
    if (!updatedOrder) {
      throw new ProductServiceError('The order could not be updated.', 500);
    }
    return toAdminOrder(updatedOrder);
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      throw new ProductServiceError(
        'Order status changes require MongoDB replica set transactions.',
        503,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function cancelAdminOrder(orderNumber: string, reason: string, actorUserId: string) {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('Order management is temporarily unavailable.', 503);
  }

  const session = await mongoose.startSession();
  try {
    const updatedOrder = await session.withTransaction(async () => {
      const order = await Order.findOne({ orderNumber })
        .select('_id status paymentStatus items cancellation')
        .session(session)
        .lean()
        .exec();
      if (!order) throw new ProductServiceError('The order was not found.', 404);
      const currentStatus = order.status as OrderStatus;
      if (currentStatus === 'cancelled') {
        const existingOrder = await Order.findById(order._id)
          .select(adminOrderProjection)
          .session(session)
          .lean()
          .exec();
        if (!existingOrder) throw new ProductServiceError('The order was not found.', 404);
        return existingOrder;
      }
      if (!canCancelOrder(currentStatus, order.paymentStatus as PaymentStatus)) {
        throw new ProductServiceError(
          'Only unpaid orders can be cancelled, and cancellation must happen before processing begins.',
          409,
        );
      }

      for (const item of order.items) {
        const result = await ProductVariant.updateOne(
          {
            _id: item.variantId,
            stockQuantity: { $lte: Number.MAX_SAFE_INTEGER - item.quantity },
          },
          { $inc: { stockQuantity: item.quantity } },
          { session },
        ).exec();
        if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
          throw new ProductServiceError(
            'Inventory could not be safely restored; the order was not cancelled.',
            409,
          );
        }
      }

      const cancelledAt = new Date();
      const cancellation = {
        reason,
        cancelledAt,
        cancelledBy: new Types.ObjectId(actorUserId),
      };
      const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: currentStatus },
        { $set: { status: 'cancelled', cancellation } },
        { new: true, runValidators: true, session },
      )
        .select(adminOrderProjection)
        .lean()
        .exec();
      if (!updated) {
        throw new ProductServiceError(
          'The order changed; refresh the order queue and try again.',
          409,
        );
      }

      await AdminAuditEvent.create(
        [
          {
            actorUserId,
            action: 'order.cancelled',
            resourceType: 'order',
            resourceId: orderNumber,
            before: { status: currentStatus },
            after: {
              status: 'cancelled',
              reason,
              restockedItems: order.items.map((item) => ({
                variantId: item.variantId.toString(),
                quantity: item.quantity,
              })),
            },
          },
        ],
        { session },
      );
      return updated;
    });
    if (!updatedOrder) {
      throw new ProductServiceError('The order could not be cancelled.', 500);
    }
    return toAdminOrder(updatedOrder);
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      throw new ProductServiceError(
        'Order cancellation requires MongoDB replica set transactions.',
        503,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function markAdminOrderCashReceived(orderNumber: string, actorUserId: string) {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('Order management is temporarily unavailable.', 503);
  }

  const session = await mongoose.startSession();
  try {
    const updatedOrder = await session.withTransaction(async () => {
      const order = await Order.findOne({ orderNumber })
        .select('_id status paymentMethod paymentStatus')
        .session(session)
        .lean()
        .exec();
      if (!order) throw new ProductServiceError('The order was not found.', 404);
      const currentStatus = order.status as OrderStatus;
      const currentPaymentStatus = order.paymentStatus as PaymentStatus;
      if (order.paymentMethod !== 'cash-on-delivery') {
        throw new ProductServiceError('Cash collection can only be recorded for a COD order.', 409);
      }
      if (currentPaymentStatus === 'paid') {
        const paidOrder = await Order.findById(order._id)
          .select(adminOrderProjection)
          .session(session)
          .lean()
          .exec();
        if (!paidOrder) throw new ProductServiceError('The order was not found.', 404);
        return paidOrder;
      }
      if (!canMarkCashReceived(currentStatus, currentPaymentStatus)) {
        throw new ProductServiceError(
          'Cash can only be marked received after the order is delivered and unpaid.',
          409,
        );
      }

      const updated = await Order.findOneAndUpdate(
        {
          _id: order._id,
          status: 'delivered',
          paymentMethod: 'cash-on-delivery',
          paymentStatus: 'unpaid',
        },
        { $set: { paymentStatus: 'paid' } },
        { new: true, runValidators: true, session },
      )
        .select(adminOrderProjection)
        .lean()
        .exec();
      if (!updated) {
        throw new ProductServiceError(
          'The order changed; refresh the order queue and try again.',
          409,
        );
      }

      await AdminAuditEvent.create(
        [
          {
            actorUserId,
            action: 'order.payment.updated',
            resourceType: 'order',
            resourceId: orderNumber,
            before: { paymentStatus: 'unpaid' },
            after: { paymentStatus: 'paid', method: 'cash-on-delivery' },
          },
        ],
        { session },
      );
      return updated;
    });
    if (!updatedOrder) {
      throw new ProductServiceError('The payment status could not be updated.', 500);
    }
    return toAdminOrder(updatedOrder);
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      throw new ProductServiceError(
        'Payment status changes require MongoDB replica set transactions.',
        503,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

function isTransactionUnsupportedError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 20;
}

function toAdminOrder(order: {
  orderNumber: string;
  customer?: { name: string; phone: string; email?: string | null } | null;
  deliveryAddress?: {
    line1: string;
    line2?: string | null;
    area: string;
    postalCode?: string | null;
    instructions?: string | null;
  } | null;
  items: Array<{
    variantId: Types.ObjectId;
    productName: string;
    productSlug: string;
    sku: string;
    size: string;
    color: string;
    quantity: number;
    unitPriceLkr: number;
    lineTotalLkr: number;
  }>;
  currency: 'LKR';
  subtotalLkr: number;
  deliveryFeeLkr: number;
  totalLkr: number;
  paymentMethod: 'cash-on-delivery' | 'payhere';
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  status: string;
  cancellation?: {
    reason?: string | null;
    cancelledAt?: Date | null;
    cancelledBy?: Types.ObjectId | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  if (!order.customer || !order.deliveryAddress) {
    throw new ProductServiceError('The stored order is missing required delivery details.', 500);
  }
  const status = order.status as OrderStatus;
  const paymentStatus = order.paymentStatus as PaymentStatus;
  let cancellation: { reason: string; cancelledAt: string; cancelledBy: string } | undefined;
  if (order.cancellation?.reason) {
    if (!order.cancellation.cancelledAt || !order.cancellation.cancelledBy) {
      throw new ProductServiceError('The stored cancellation details are incomplete.', 500);
    }
    cancellation = {
      reason: order.cancellation.reason,
      cancelledAt: order.cancellation.cancelledAt.toISOString(),
      cancelledBy: order.cancellation.cancelledBy.toString(),
    };
  }
  return {
    orderNumber: order.orderNumber,
    customer: order.customer,
    deliveryAddress: order.deliveryAddress,
    items: order.items.map((item) => ({
      ...item,
      variantId: item.variantId.toString(),
    })),
    currency: order.currency,
    subtotalLkr: order.subtotalLkr,
    deliveryFeeLkr: order.deliveryFeeLkr,
    totalLkr: order.totalLkr,
    paymentMethod: order.paymentMethod,
    paymentStatus,
    status,
    ...(cancellation && { cancellation }),
    canCancel: canCancelOrder(status, paymentStatus),
    canMarkCashReceived:
      order.paymentMethod === 'cash-on-delivery' && canMarkCashReceived(status, paymentStatus),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    nextStatuses: getNextOrderStatuses(status).filter((nextStatus) =>
      canAdvanceOrderStatus(status, nextStatus, order.paymentMethod, paymentStatus),
    ),
  };
}

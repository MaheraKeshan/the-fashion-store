import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAdvanceOrderStatus,
  canCancelOrder,
  canMarkCashReceived,
  getNextOrderStatuses,
} from '../src/domain/order-status.js';
import {
  cancelOrderSchema,
  listAdminOrdersQuerySchema,
  markCashReceivedSchema,
  orderNumberSchema,
  updateOrderStatusSchema,
} from '../src/schemas/admin-order.js';

test('admin order list accepts bounded cursor pages and valid status filters', () => {
  const result = listAdminOrdersQuerySchema.safeParse({
    cursor: '1790000000000_507f1f77bcf86cd799439011',
    limit: '25',
    status: 'processing',
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.limit, 25);
    assert.equal(result.data.status, 'processing');
  }
  assert.equal(listAdminOrdersQuerySchema.safeParse({ limit: '51' }).success, false);
  assert.equal(listAdminOrdersQuerySchema.safeParse({ cursor: 'invalid' }).success, false);
});

test('admin status updates only permit the next fulfillment state', () => {
  assert.equal(updateOrderStatusSchema.safeParse({ status: 'confirmed' }).success, true);
  assert.equal(updateOrderStatusSchema.safeParse({ status: 'paid' }).success, false);
  assert.equal(updateOrderStatusSchema.safeParse({ status: 'cancelled' }).success, false);
  assert.deepEqual(getNextOrderStatuses('pending'), ['confirmed']);
  assert.deepEqual(getNextOrderStatuses('shipped'), ['delivered']);
  assert.deepEqual(getNextOrderStatuses('delivered'), []);
  assert.deepEqual(getNextOrderStatuses('cancelled'), []);
  assert.equal(
    canAdvanceOrderStatus('confirmed', 'processing', 'cash-on-delivery', 'unpaid'),
    true,
  );
  assert.equal(canAdvanceOrderStatus('confirmed', 'processing', 'payhere', 'paid'), true);
  assert.equal(canAdvanceOrderStatus('confirmed', 'processing', 'payhere', 'unpaid'), false);
});

test('cancellation is limited to orders not yet processing', () => {
  assert.equal(canCancelOrder('pending', 'unpaid'), true);
  assert.equal(canCancelOrder('confirmed', 'unpaid'), true);
  assert.equal(canCancelOrder('processing', 'unpaid'), false);
  assert.equal(canCancelOrder('shipped', 'unpaid'), false);
  assert.equal(canCancelOrder('delivered', 'unpaid'), false);
  assert.equal(canCancelOrder('cancelled', 'unpaid'), false);
  assert.equal(canCancelOrder('pending', 'paid'), false);
  assert.equal(canCancelOrder('confirmed', 'refunded'), false);

  assert.equal(cancelOrderSchema.safeParse({ reason: ' Customer request ' }).success, true);
  assert.equal(cancelOrderSchema.safeParse({ reason: ' no ' }).success, false);
  assert.equal(cancelOrderSchema.safeParse({ reason: 'valid reason', extra: true }).success, false);
});

test('COD cash can only be marked received on delivered unpaid orders', () => {
  assert.equal(canMarkCashReceived('delivered', 'unpaid'), true);
  assert.equal(canMarkCashReceived('delivered', 'paid'), false);
  assert.equal(canMarkCashReceived('pending', 'unpaid'), false);
  assert.equal(canMarkCashReceived('cancelled', 'unpaid'), false);
  assert.equal(canMarkCashReceived('delivered', 'refunded'), false);

  assert.equal(markCashReceivedSchema.safeParse({ status: 'paid' }).success, true);
  assert.equal(markCashReceivedSchema.safeParse({ status: 'refunded' }).success, false);
});

test('admin order numbers must match the generated order format', () => {
  assert.equal(orderNumberSchema.safeParse('TFS-M8XYZ-4A9B2C7D').success, true);
  assert.equal(orderNumberSchema.safeParse('TFS-invalid-order').success, false);
});

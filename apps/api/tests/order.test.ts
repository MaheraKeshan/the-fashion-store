import assert from 'node:assert/strict';
import test from 'node:test';
import { phoneNumbersMatch } from '../src/domain/phone.js';
import {
  createOrderRequestSchema,
  idempotencyKeySchema,
  trackOrderRequestSchema,
} from '../src/schemas/order.js';
import { createOrderRequestHash } from '../src/services/order.service.js';

const validOrder = {
  customer: {
    name: 'Customer Example',
    phone: '+94 77-123-4567',
    email: 'CUSTOMER@example.com',
  },
  deliveryAddress: {
    line1: '12 Example Street',
    area: 'Colombo 01',
  },
  items: [{ variantId: '507f1f77bcf86cd799439011', quantity: 1 }],
};

test('COD order schema normalizes contact data and excludes client totals', () => {
  const result = createOrderRequestSchema.safeParse(validOrder);
  const withClientTotal = createOrderRequestSchema.safeParse({ ...validOrder, totalLkr: 1 });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.customer.phone, '+94771234567');
    assert.equal(result.data.customer.email, 'customer@example.com');
  }
  assert.equal(withClientTotal.success, false);
});

test('idempotency key must be a UUID', () => {
  assert.equal(idempotencyKeySchema.safeParse('not-a-uuid').success, false);
  assert.equal(
    idempotencyKeySchema.safeParse('2ac92f72-2994-4aeb-93b0-f8455fa53d22').success,
    true,
  );
});

test('order tracking validates the order number and Sri Lankan phone without accepting extra data', () => {
  const result = trackOrderRequestSchema.safeParse({
    orderNumber: ' tfs-m8xyz-4a9b2c7d ',
    phone: '077 123 4567',
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.orderNumber, 'TFS-M8XYZ-4A9B2C7D');
    assert.equal(result.data.phone, '0771234567');
  }
  assert.equal(
    trackOrderRequestSchema.safeParse({
      orderNumber: 'TFS-invalid-order',
      phone: '0771234567',
    }).success,
    false,
  );
  assert.equal(
    trackOrderRequestSchema.safeParse({
      orderNumber: 'TFS-M8XYZ-4A9B2C7D',
      phone: '0771234567',
      email: 'not-needed@example.com',
    }).success,
    false,
  );
});

test('order tracking matches equivalent local and international mobile formats', () => {
  assert.equal(phoneNumbersMatch('+94 77-123-4567', '0771234567'), true);
  assert.equal(phoneNumbersMatch('0771234567', '+94 77 123 4568'), false);
});

test('checkout idempotency fingerprints are stable for equivalent item ordering', () => {
  const first = createOrderRequestSchema.parse(validOrder);
  const reordered = createOrderRequestSchema.parse({
    ...validOrder,
    items: [
      { variantId: '507f1f77bcf86cd799439012', quantity: 2 },
      { variantId: '507f1f77bcf86cd799439011', quantity: 1 },
    ],
  });
  const firstReordered = createOrderRequestSchema.parse({
    ...validOrder,
    items: [...validOrder.items].reverse(),
  });

  assert.equal(createOrderRequestHash(first, '507f1f77bcf86cd799439099'), createOrderRequestHash(
    createOrderRequestSchema.parse(validOrder),
    '507f1f77bcf86cd799439099',
  ));
  assert.notEqual(
    createOrderRequestHash(first, '507f1f77bcf86cd799439099'),
    createOrderRequestHash(reordered, '507f1f77bcf86cd799439099'),
  );
  assert.equal(
    createOrderRequestHash(firstReordered, '507f1f77bcf86cd799439099'),
    createOrderRequestHash(first, '507f1f77bcf86cd799439099'),
  );
});


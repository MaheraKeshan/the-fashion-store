import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductServiceError } from '../src/services/product.service.js';
import {
  assertPayHereConfigured,
  assertPayHereOrderPayable,
} from '../src/services/payhere.service.js';

test('PayHere configuration is validated before an order can be created', () => {
  assert.throws(
    () =>
      assertPayHereConfigured({
        PAYHERE_MERCHANT_ID: undefined,
        PAYHERE_MERCHANT_SECRET: undefined,
      }),
    (error: unknown) => error instanceof ProductServiceError && error.statusCode === 503,
  );
  assert.doesNotThrow(() =>
    assertPayHereConfigured({
      PAYHERE_MERCHANT_ID: 'merchant-id',
      PAYHERE_MERCHANT_SECRET: 'merchant-secret',
    }),
  );
});

test('PayHere checkout cannot be recreated for paid, cancelled, or fulfilled orders', () => {
  assert.doesNotThrow(() =>
    assertPayHereOrderPayable({ status: 'pending', paymentStatus: 'unpaid' }),
  );
  assert.doesNotThrow(() =>
    assertPayHereOrderPayable({ status: 'confirmed', paymentStatus: 'unpaid' }),
  );
  for (const order of [
    { status: 'pending', paymentStatus: 'paid' },
    { status: 'cancelled', paymentStatus: 'unpaid' },
    { status: 'processing', paymentStatus: 'unpaid' },
  ]) {
    assert.throws(
      () => assertPayHereOrderPayable(order),
      (error: unknown) => error instanceof ProductServiceError && error.statusCode === 409,
    );
  }
});

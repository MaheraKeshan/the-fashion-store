import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Order } from '../src/models/order.js';

process.env.NODE_ENV = 'test';
process.env.PAYHERE_MERCHANT_ID = '1234567';
process.env.PAYHERE_MERCHANT_SECRET = 'integration-secret';

const { reconcilePayHereNotification } = await import('../src/services/payhere.service.js');

const merchantId = process.env.PAYHERE_MERCHANT_ID;
const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

function createNotification(statusCode: '2' | '-3', orderNumber: string) {
  const amount = '1850.00';
  const currency = 'LKR';
  const secretHash = createHash('md5').update(merchantSecret!).digest('hex').toUpperCase();
  const signature = createHash('md5')
    .update(`${merchantId}${orderNumber}${amount}${currency}${statusCode}${secretHash}`)
    .digest('hex')
    .toUpperCase();
  return {
    merchant_id: merchantId!,
    order_id: orderNumber,
    payhere_amount: amount,
    payhere_currency: currency,
    status_code: statusCode,
    md5sig: signature,
    payment_id: 'PAYHERE-REFERENCE-001',
  };
}

test('PayHere notifications validate amounts and apply monotonic, idempotent payment transitions', async (context) => {
  let replSet: MongoMemoryReplSet | undefined;

  try {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, name: 'payhere-integration-rs' },
    });
  } catch (error) {
    context.skip(
      `MongoDB replica-set integration unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  try {
    await mongoose.connect(replSet.getUri(), {
      dbName: 'fashion_store_payhere_integration',
      serverSelectionTimeoutMS: 5000,
    });
    await mongoose.connection.db?.dropDatabase();
    await Order.syncIndexes();

    const orderNumber = 'TFS-PAYHERE-INTEGRATION';
    const order = await Order.create({
      orderNumber,
      idempotencyKey: '2ac92f72-2994-4aeb-93b0-f8455fa53d30',
      customer: { name: 'Payment Test', phone: '0771234567' },
      deliveryAddress: { line1: '12 Test Road', area: 'Colombo 03' },
      items: [
        {
          variantId: new mongoose.Types.ObjectId(),
          productName: 'Test Product',
          productSlug: 'test-product',
          sku: 'TEST-001',
          size: 'M',
          color: 'Black',
          quantity: 1,
          unitPriceLkr: 1500,
          lineTotalLkr: 1500,
        },
      ],
      currency: 'LKR',
      subtotalLkr: 1500,
      deliveryFeeLkr: 350,
      totalLkr: 1850,
      paymentMethod: 'payhere',
      paymentStatus: 'unpaid',
      status: 'pending',
    });

    await assert.rejects(
      reconcilePayHereNotification(createNotification('-3', orderNumber)),
      /unpaid PayHere order cannot be marked refunded/,
    );
    assert.equal((await Order.findById(order._id).lean().exec())?.paymentStatus, 'unpaid');

    const paidNotification = createNotification('2', orderNumber);
    const paidAt = new Date();
    await reconcilePayHereNotification(paidNotification);
    const paidOrder = await Order.findById(order._id).lean().exec();
    assert.equal(paidOrder?.paymentStatus, 'paid');
    assert.equal(paidOrder?.paymentReference, 'PAYHERE-REFERENCE-001');
    assert.ok(paidOrder?.paymentPaidAt && paidOrder.paymentPaidAt >= paidAt);

    await reconcilePayHereNotification(paidNotification);
    assert.equal((await Order.findById(order._id).lean().exec())?.paymentStatus, 'paid');

    await reconcilePayHereNotification(createNotification('-3', orderNumber));
    assert.equal((await Order.findById(order._id).lean().exec())?.paymentStatus, 'refunded');
    await assert.rejects(
      reconcilePayHereNotification(paidNotification),
      /refunded PayHere payment cannot be marked paid/,
    );
  } finally {
    await mongoose.disconnect();
    await replSet?.stop();
  }
});

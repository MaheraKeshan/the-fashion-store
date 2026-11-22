import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Category } from '../src/models/category.js';
import { Order } from '../src/models/order.js';
import { Product } from '../src/models/product.js';
import { ProductVariant } from '../src/models/product-variant.js';
import { StoreSettings } from '../src/models/store-settings.js';
import { createCashOnDeliveryOrder } from '../src/services/order.service.js';

const validRequest = {
  customer: {
    name: 'Integration Customer',
    phone: '0771234567',
    email: 'integration@example.com',
  },
  deliveryAddress: {
    line1: '12 Integration Street',
    area: 'Colombo 03',
  },
  items: [] as Array<{ variantId: string; quantity: number }>,
};

test('COD orders preserve stock and idempotency on a MongoDB replica set', async (context) => {
  let replSet: MongoMemoryReplSet | undefined;

  try {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, name: 'integration-rs' },
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
      dbName: 'fashion_store_integration',
      serverSelectionTimeoutMS: 5000,
    });

    await mongoose.connection.db?.dropDatabase();
    await Promise.all([
      Order.syncIndexes(),
      Category.syncIndexes(),
      Product.syncIndexes(),
      ProductVariant.syncIndexes(),
      StoreSettings.syncIndexes(),
    ]);

    await StoreSettings.create({
      storeKey: 'default',
      currency: 'LKR',
      deliveryPricingMethod: 'flat',
      deliveryFeeLkr: 350,
      coveredAreas: ['Colombo 03'],
      deliveryConfirmed: true,
    });

    const category = await Category.create({
      name: 'Integration',
      slug: 'integration',
      isActive: true,
    });
    const product = await Product.create({
      name: 'Integration Product',
      slug: 'integration-product',
      description: 'Replica-set integration test product',
      categoryId: category._id,
      gender: 'unisex',
      isActive: true,
    });
    const variant = await ProductVariant.create({
      productId: product._id,
      sku: 'INTEGRATION-ONE',
      size: 'M',
      color: 'Black',
      price: 1500,
      stockQuantity: 1,
      isActive: true,
    });

    validRequest.items = [{ variantId: variant._id.toString(), quantity: 1 }];

    const idempotencyKey = '2ac92f72-2994-4aeb-93b0-f8455fa53d22';
    const retries = await Promise.all([
      createCashOnDeliveryOrder(validRequest, idempotencyKey),
      createCashOnDeliveryOrder(validRequest, idempotencyKey),
    ]);

    assert.equal(retries.filter((retry) => !retry.replayed).length, 1);
    assert.equal(retries.filter((retry) => retry.replayed).length, 1);
    assert.equal(retries[0].order.orderNumber, retries[1].order.orderNumber);
    assert.equal(await Order.countDocuments({ idempotencyKey }), 1);

    const remainingVariant = await ProductVariant.findById(variant._id).lean().exec();
    assert.equal(remainingVariant?.stockQuantity, 0);

    await ProductVariant.findByIdAndUpdate(variant._id, { stockQuantity: 1 }).exec();
    const competingKeys = [
      '2ac92f72-2994-4aeb-93b0-f8455fa53d23',
      '2ac92f72-2994-4aeb-93b0-f8455fa53d24',
    ];
    const outcomes = await Promise.allSettled(
      competingKeys.map((key) => createCashOnDeliveryOrder(validRequest, key)),
    );
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const finalVariant = await ProductVariant.findById(variant._id).lean().exec();
    assert.equal(finalVariant?.stockQuantity, 0);
  } finally {
    await mongoose.disconnect();
    await replSet?.stop();
  }
});

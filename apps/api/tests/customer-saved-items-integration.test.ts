import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, default as test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';

const rateLimitRedis = await import('../src/config/rate-limit-store.js');
if (process.env.RATE_LIMIT_REDIS_URL) await rateLimitRedis.connectRateLimitRedis();
const [
  { app },
  { env },
  { Category },
  { Customer },
  { CustomerPasswordReset },
  { CustomerSession },
  { Order },
  { Product },
  { ProductVariant },
  { customerAuthService },
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/env.js'),
  import('../src/models/category.js'),
  import('../src/models/customer.js'),
  import('../src/models/customer-password-reset.js'),
  import('../src/models/customer-session.js'),
  import('../src/models/order.js'),
  import('../src/models/product.js'),
  import('../src/models/product-variant.js'),
  import('../src/services/customer-auth.service.js'),
]);

after(async () => {
  await rateLimitRedis.disconnectRateLimitRedis();
});

test('saved carts and wishlists persist per customer and cart totals use current catalogue data', async (context) => {
  let replSet: MongoMemoryReplSet | undefined;
  try {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, name: 'customer-saved-items-integration-rs' },
    });
  } catch (error) {
    context.skip(
      `MongoDB replica-set integration unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  let server: ReturnType<typeof createServer> | undefined;
  try {
    await mongoose.connect(replSet.getUri(), {
      dbName: 'fashion_store_customer_saved_items_integration',
      serverSelectionTimeoutMS: 5000,
    });
    await mongoose.connection.db?.dropDatabase();
    await Promise.all([
      Category.syncIndexes(),
      Customer.syncIndexes(),
      CustomerPasswordReset.syncIndexes(),
      CustomerSession.syncIndexes(),
      Order.syncIndexes(),
      Product.syncIndexes(),
      ProductVariant.syncIndexes(),
    ]);

    const category = await Category.create({
      name: 'Saved Items',
      slug: 'saved-items',
      isActive: true,
    });
    const product = await Product.create({
      name: 'Saved Item Product',
      slug: 'saved-item-product',
      description: 'Saved item integration test product',
      categoryId: category._id,
      gender: 'unisex',
      isActive: true,
    });
    const variant = await ProductVariant.create({
      productId: product._id,
      sku: 'SAVED-ITEM-ONE',
      size: 'M',
      color: 'Black',
      price: 1500,
      stockQuantity: 3,
      isActive: true,
    });
    const firstCustomer = await customerAuthService.register(
      'First Customer',
      'first-saved-items@example.com',
      'first-customer-password',
    );
    const secondCustomer = await customerAuthService.register(
      'Second Customer',
      'second-saved-items@example.com',
      'second-customer-password',
    );

    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server?.once('error', reject);
      server?.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1/customer/auth`;
    const origin = new URL(env.CLIENT_URL).origin;
    const firstCookie = `tfs-customer-session=${encodeURIComponent(firstCustomer.token)}`;
    const secondCookie = `tfs-customer-session=${encodeURIComponent(secondCustomer.token)}`;
    const mutationHeaders = {
      'Content-Type': 'application/json',
      Origin: origin,
      'x-csrf-token': firstCustomer.csrfToken,
      Cookie: firstCookie,
    };

    const unauthorized = await fetch(`${baseUrl}/cart`);
    assert.equal(unauthorized.status, 401);

    const csrfRejected = await fetch(`${baseUrl}/cart`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: firstCookie },
      body: JSON.stringify({ items: [{ variantId: variant._id.toString(), quantity: 2 }] }),
    });
    assert.equal(csrfRejected.status, 403);

    const savedCartResponse = await fetch(`${baseUrl}/cart`, {
      method: 'PUT',
      headers: mutationHeaders,
      body: JSON.stringify({ items: [{ variantId: variant._id.toString(), quantity: 2 }] }),
    });
    assert.equal(savedCartResponse.status, 200);
    const savedCart = await savedCartResponse.json();
    assert.equal(savedCart.data.subtotal, 3000);
    assert.equal(savedCart.data.items[0].unitPrice, 1500);

    await ProductVariant.updateOne({ _id: variant._id }, { $set: { price: 1800 } }).exec();
    const repricedCartResponse = await fetch(`${baseUrl}/cart`, {
      headers: { Cookie: firstCookie },
    });
    const repricedCart = await repricedCartResponse.json();
    assert.equal(repricedCart.data.items[0].unitPrice, 1800);
    assert.equal(repricedCart.data.subtotal, 3600);

    const savedWishlistResponse = await fetch(`${baseUrl}/wishlist`, {
      method: 'PUT',
      headers: mutationHeaders,
      body: JSON.stringify({ productIds: [product._id.toString()] }),
    });
    assert.equal(savedWishlistResponse.status, 200);
    const savedWishlist = await savedWishlistResponse.json();
    assert.deepEqual(savedWishlist.data.items, [
      { productId: product._id.toString(), slug: product.slug },
    ]);

    const otherCustomerCartResponse = await fetch(`${baseUrl}/cart`, {
      headers: { Cookie: secondCookie },
    });
    const otherCustomerCart = await otherCustomerCartResponse.json();
    assert.deepEqual(otherCustomerCart.data.items, []);
    assert.equal(otherCustomerCart.data.subtotal, 0);

    const otherCustomerWishlistResponse = await fetch(`${baseUrl}/wishlist`, {
      headers: { Cookie: secondCookie },
    });
    const otherCustomerWishlist = await otherCustomerWishlistResponse.json();
    assert.deepEqual(otherCustomerWishlist.data.items, []);

    const clearedCartResponse = await fetch(`${baseUrl}/cart`, {
      method: 'PUT',
      headers: mutationHeaders,
      body: JSON.stringify({ items: [] }),
    });
    const clearedCart = await clearedCartResponse.json();
    assert.deepEqual(clearedCart.data.items, []);
    assert.equal(clearedCart.data.subtotal, 0);

    const clearedWishlistResponse = await fetch(`${baseUrl}/wishlist`, {
      method: 'PUT',
      headers: mutationHeaders,
      body: JSON.stringify({ productIds: [] }),
    });
    const clearedWishlist = await clearedWishlistResponse.json();
    assert.deepEqual(clearedWishlist.data.items, []);

    const firstCustomerContext = await customerAuthService.resolveSession(firstCustomer.token);
    assert.ok(firstCustomerContext);
    const idempotencyKey = '1c2a073b-c6f7-4a63-ae76-1185441f51c6';
    const requestHash = 'f'.repeat(64);
    const linkedOrder = await Order.create({
      orderNumber: 'TFS-ACCOUNT-DELETE-01',
      idempotencyKey,
      requestHash,
      customerId: firstCustomerContext.actor.id,
      customer: {
        name: 'First Customer',
        phone: '0771234567',
        email: 'first-saved-items@example.com',
      },
      deliveryAddress: {
        line1: '12 Galle Road',
        line2: 'Apartment 4',
        area: 'Colombo 03',
        postalCode: '00300',
        instructions: 'Call on arrival',
      },
      items: [
        {
          variantId: variant._id,
          productName: product.name,
          productSlug: product.slug,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          quantity: 1,
          unitPriceLkr: 1800,
          lineTotalLkr: 1800,
        },
      ],
      currency: 'LKR',
      subtotalLkr: 1800,
      deliveryFeeLkr: 350,
      totalLkr: 2150,
      paymentMethod: 'cash-on-delivery',
      paymentStatus: 'paid',
      status: 'delivered',
    });
    await CustomerPasswordReset.create({
      customerId: firstCustomerContext.actor.id,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const incorrectPasswordDeletion = await fetch(`${baseUrl}/account`, {
      method: 'DELETE',
      headers: mutationHeaders,
      body: JSON.stringify({ currentPassword: 'incorrect-password' }),
    });
    assert.equal(incorrectPasswordDeletion.status, 401);
    assert.ok(await Customer.findById(firstCustomerContext.actor.id).exec());

    const deletionResponse = await fetch(`${baseUrl}/account`, {
      method: 'DELETE',
      headers: mutationHeaders,
      body: JSON.stringify({ currentPassword: 'first-customer-password' }),
    });
    assert.equal(deletionResponse.status, 200);
    assert.match(deletionResponse.headers.get('set-cookie') ?? '', /Max-Age=0/);
    assert.deepEqual(await deletionResponse.json(), {
      success: true,
      data: { accountDeleted: true },
    });
    assert.equal(await Customer.findById(firstCustomerContext.actor.id).exec(), null);
    assert.equal(
      await CustomerSession.countDocuments({ customerId: firstCustomerContext.actor.id }),
      0,
    );
    assert.equal(
      await CustomerPasswordReset.countDocuments({ customerId: firstCustomerContext.actor.id }),
      0,
    );

    const anonymizedOrder = await Order.findById(linkedOrder._id)
      .select('+requestHash')
      .lean()
      .exec();
    assert.equal(anonymizedOrder?.customer?.name, 'Deleted customer');
    assert.equal(anonymizedOrder?.customer?.phone, 'REDACTED');
    assert.equal(anonymizedOrder?.customer?.email, undefined);
    assert.equal(anonymizedOrder?.deliveryAddress?.line1, 'Removed');
    assert.equal(anonymizedOrder?.deliveryAddress?.area, 'Removed');
    assert.equal(anonymizedOrder?.deliveryAddress?.line2, undefined);
    assert.equal(anonymizedOrder?.customerId, undefined);
    assert.notEqual(anonymizedOrder?.requestHash, requestHash);
    assert.equal(anonymizedOrder?.totalLkr, 2150);

    const deletedSessionResponse = await fetch(`${baseUrl}/session`, {
      headers: { Cookie: firstCookie },
    });
    assert.equal(deletedSessionResponse.status, 401);
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await mongoose.disconnect();
    await replSet.stop();
  }
});

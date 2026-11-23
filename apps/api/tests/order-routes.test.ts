import assert from 'node:assert/strict';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'node:http';
import test from 'node:test';

process.env.NODE_ENV = 'test';

const rateLimitRedis = await import('../src/config/rate-limit-store.js');
await rateLimitRedis.connectRateLimitRedis();
const [{ app }, { env }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/env.js'),
]);

test('PayHere routes are registered when the API starts', async () => {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const readiness = await fetch(`${baseUrl}/api/v1/health/ready`);
    assert.equal(readiness.status, 503);
    assert.deepEqual(await readiness.json(), {
      status: 'not_ready',
      database: 'disconnected',
      rateLimiter: 'ready',
    });

    const notification = await fetch(`${baseUrl}/api/v1/payments/payhere/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(notification.status, 400);
    assert.equal(await notification.text(), 'INVALID');

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const checkout = await fetch(`${baseUrl}/api/v1/orders/payhere/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: new URL(env.CLIENT_URL).origin,
        },
        body: '{}',
      });
      assert.equal(checkout.status, 400);
      assert.match((await checkout.json()).message, /Invalid PayHere checkout request/);
    }

    const limitedCheckout = await fetch(`${baseUrl}/api/v1/orders/payhere/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: new URL(env.CLIENT_URL).origin,
      },
      body: '{}',
    });
    assert.equal(limitedCheckout.status, 429);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rateLimitRedis.disconnectRateLimitRedis();
  }
});

test(
  'Redis rate limits are shared across separate API instances',
  { skip: !env.RATE_LIMIT_REDIS_URL },
  async () => {
    await rateLimitRedis.connectRateLimitRedis();

    const createInstance = () => {
      const instance = express();
      instance.get(
        '/limited',
        rateLimit({
          store: rateLimitRedis.createRateLimitStore('cross-instance-checkout'),
          windowMs: 60_000,
          limit: 1,
          passOnStoreError: false,
          standardHeaders: true,
          legacyHeaders: false,
        }),
        (_request, response) => response.sendStatus(204),
      );
      return createServer(instance);
    };

    const servers = [createInstance(), createInstance()];
    const addresses: string[] = [];

    try {
      for (const server of servers) {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });

        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        addresses.push(`http://127.0.0.1:${address.port}`);
      }

      assert.equal((await fetch(`${addresses[0]}/limited`)).status, 204);
      assert.equal((await fetch(`${addresses[1]}/limited`)).status, 429);
    } finally {
      await Promise.all(
        servers.map(
          (server) =>
            new Promise<void>((resolve, reject) => {
              if (!server.listening) {
                resolve();
                return;
              }
              server.close((error) => (error ? reject(error) : resolve()));
            }),
        ),
      );
      await rateLimitRedis.disconnectRateLimitRedis();
    }
  },
);

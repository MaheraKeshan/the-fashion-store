import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';
import { parseEnvironment } from '../src/config/env.js';

test('development environment permits local database-less startup', () => {
  const result = parseEnvironment({
    NODE_ENV: 'development',
  });
  assert.equal(result.NODE_ENV, 'development');
  assert.equal(result.PORT, 5000);
});

test('production environment requires database, HTTPS and reset delivery', () => {
  assert.throws(
    () =>
      parseEnvironment({
        NODE_ENV: 'production',
        CLIENT_URL: 'http://localhost:5173',
      }),
    (error: unknown) => error instanceof ZodError,
  );

  const result = parseEnvironment({
    NODE_ENV: 'production',
    CLIENT_URL: 'https://shop.example.com',
    MONGODB_URI: 'mongodb://mongodb.example.com:27017/fashion-store',
    RATE_LIMIT_REDIS_URL: 'rediss://redis.example.com:6380',
    PASSWORD_RESET_WEBHOOK_URL: 'https://hooks.example.com/password-reset',
    PAYHERE_MERCHANT_ID: '1234567',
    PAYHERE_MERCHANT_SECRET: 'real-api-secret',
    PAYHERE_NOTIFY_URL: 'https://api.example.com/api/v1/payments/payhere/notify',
  });
  assert.equal(result.NODE_ENV, 'production');
});

test('production requires a TLS-enabled Redis rate-limit store', () => {
  const productionSettings = {
    NODE_ENV: 'production',
    CLIENT_URL: 'https://shop.example.com',
    MONGODB_URI: 'mongodb://mongodb.example.com:27017/fashion-store',
    PASSWORD_RESET_WEBHOOK_URL: 'https://hooks.example.com/password-reset',
    PAYHERE_MERCHANT_ID: '1234567',
    PAYHERE_MERCHANT_SECRET: 'real-api-secret',
    PAYHERE_NOTIFY_URL: 'https://api.example.com/api/v1/payments/payhere/notify',
  };
  assert.throws(
    () => parseEnvironment(productionSettings),
    (error: unknown) => error instanceof ZodError,
  );
  assert.throws(
    () =>
      parseEnvironment({
        ...productionSettings,
        RATE_LIMIT_REDIS_URL: 'redis://redis.example.com:6379',
      }),
    (error: unknown) => error instanceof ZodError,
  );
});

test('production password-reset and payment webhook URLs must use HTTPS', () => {
  for (const [key, url] of [
    ['PASSWORD_RESET_WEBHOOK_URL', 'http://hooks.example.com/password-reset'],
    ['PAYHERE_NOTIFY_URL', 'http://api.example.com/api/v1/payments/payhere/notify'],
  ] as const) {
    assert.throws(
      () =>
        parseEnvironment({
          NODE_ENV: 'production',
          CLIENT_URL: 'https://shop.example.com',
          MONGODB_URI: 'mongodb://mongodb.example.com:27017/fashion-store',
          RATE_LIMIT_REDIS_URL: 'rediss://redis.example.com:6380',
          PASSWORD_RESET_WEBHOOK_URL: 'https://hooks.example.com/password-reset',
          PAYHERE_MERCHANT_ID: '1234567',
          PAYHERE_MERCHANT_SECRET: 'real-api-secret',
          PAYHERE_NOTIFY_URL: 'https://api.example.com/api/v1/payments/payhere/notify',
          [key]: url,
        }),
      (error: unknown) => error instanceof ZodError,
      `${key} should require HTTPS`,
    );
  }
});

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
    PASSWORD_RESET_WEBHOOK_URL: 'https://hooks.example.com/password-reset',
    PAYHERE_MERCHANT_ID: '1234567',
    PAYHERE_MERCHANT_SECRET: 'real-api-secret',
    PAYHERE_NOTIFY_URL: 'https://api.example.com/api/v1/payments/payhere/notify',
  });
  assert.equal(result.NODE_ENV, 'production');
});

import 'dotenv/config';
import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    CLIENT_URL: z.string().url().default('http://localhost:5173'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    MONGODB_URI: z.string().optional(),
    RATE_LIMIT_REDIS_URL: z.string().url().optional(),
    PASSWORD_RESET_WEBHOOK_URL: z.string().url().optional(),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(30),
    PAYHERE_MERCHANT_ID: z.string().trim().min(1).optional(),
    PAYHERE_MERCHANT_SECRET: z.string().trim().min(1).optional(),
    PAYHERE_NOTIFY_URL: z.string().url().optional(),
    PAYHERE_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  })
  .superRefine((value, context) => {
    if (
      value.RATE_LIMIT_REDIS_URL &&
      !['redis:', 'rediss:'].includes(new URL(value.RATE_LIMIT_REDIS_URL).protocol)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['RATE_LIMIT_REDIS_URL'],
        message: 'RATE_LIMIT_REDIS_URL must use the redis or rediss protocol.',
      });
    }

    if (value.NODE_ENV !== 'production') return;

    if (!value.MONGODB_URI || value.MONGODB_URI.includes('<')) {
      context.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI is required in production.',
      });
    }

    if (!value.RATE_LIMIT_REDIS_URL) {
      context.addIssue({
        code: 'custom',
        path: ['RATE_LIMIT_REDIS_URL'],
        message: 'RATE_LIMIT_REDIS_URL is required in production.',
      });
    } else if (new URL(value.RATE_LIMIT_REDIS_URL).protocol !== 'rediss:') {
      context.addIssue({
        code: 'custom',
        path: ['RATE_LIMIT_REDIS_URL'],
        message: 'RATE_LIMIT_REDIS_URL must use TLS (rediss) in production.',
      });
    }

    if (new URL(value.CLIENT_URL).protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        path: ['CLIENT_URL'],
        message: 'CLIENT_URL must use HTTPS in production.',
      });
    }

    for (const key of ['PASSWORD_RESET_WEBHOOK_URL', 'PAYHERE_NOTIFY_URL'] as const) {
      const url = value[key];
      if (url && new URL(url).protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must use HTTPS in production.`,
        });
      }
    }

    if (!value.PASSWORD_RESET_WEBHOOK_URL) {
      context.addIssue({
        code: 'custom',
        path: ['PASSWORD_RESET_WEBHOOK_URL'],
        message: 'PASSWORD_RESET_WEBHOOK_URL is required in production.',
      });
    }

    if (!value.PAYHERE_MERCHANT_ID) {
      context.addIssue({
        code: 'custom',
        path: ['PAYHERE_MERCHANT_ID'],
        message: 'PAYHERE_MERCHANT_ID is required in production.',
      });
    }

    if (!value.PAYHERE_MERCHANT_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['PAYHERE_MERCHANT_SECRET'],
        message: 'PAYHERE_MERCHANT_SECRET is required in production.',
      });
    }

    if (!value.PAYHERE_NOTIFY_URL) {
      context.addIssue({
        code: 'custom',
        path: ['PAYHERE_NOTIFY_URL'],
        message: 'PAYHERE_NOTIFY_URL is required in production.',
      });
    }

    if (value.TRUST_PROXY_HOPS < 0) {
      context.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY_HOPS'],
        message: 'TRUST_PROXY_HOPS must be a non-negative integer.',
      });
    }
  });

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  return envSchema.parse(input);
}

export const env = parseEnvironment(process.env);

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { getDatabaseStatus } from './config/database.js';
import { ProductServiceError } from './services/product.service.js';
import { productRouter } from './routes/product.routes.js';
import { cartRouter } from './routes/cart.routes.js';
import { storeSettingsRouter } from './routes/store-settings.routes.js';
import { adminStoreSettingsRouter } from './routes/admin-store-settings.routes.js';
import { adminOrdersRouter } from './routes/admin-orders.routes.js';
import { adminAuthRouter } from './routes/admin-auth.routes.js';
import { orderRouter, payHereRouter } from './routes/order.routes.js';
import { customerAuthRouter } from './routes/customer-auth.routes.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.use(helmet());
app.use(
  cors({
    origin: new URL(env.CLIENT_URL).origin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'the-fashion-store-api',
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1/products', productRouter);
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/store-settings', storeSettingsRouter);
app.use('/api/v1/admin/auth', adminAuthRouter);
app.use('/api/v1/admin/store-settings', adminStoreSettingsRouter);
app.use('/api/v1/admin/orders', adminOrdersRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/payments/payhere', payHereRouter);
app.use('/api/v1/customer/auth', customerAuthRouter);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'The requested API endpoint was not found.',
  });
});

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (typeof error === 'object' && error !== null && 'type' in error) {
      if (error.type === 'entity.parse.failed') {
        res
          .status(400)
          .json({ success: false, message: 'The request body must contain valid JSON.' });
        return;
      }
      if (error.type === 'entity.too.large') {
        res.status(413).json({ success: false, message: 'The request body is too large.' });
        return;
      }
    }
    if (error instanceof ProductServiceError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      res
        .status(409)
        .json({ success: false, message: 'A record with the same unique value exists.' });
      return;
    }
    console.error('Unhandled API error:', error);
    res.status(500).json({ success: false, message: 'An unexpected server error occurred.' });
  },
);

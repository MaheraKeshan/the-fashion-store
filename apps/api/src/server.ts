import {
  assertProductionReplicaSet,
  connectDatabase,
  disconnectDatabase,
} from './config/database.js';
import { env } from './config/env.js';
import { connectRateLimitRedis, disconnectRateLimitRedis } from './config/rate-limit-store.js';
import { getStoreSettings } from './services/store-settings.service.js';

async function startServer() {
  await connectRateLimitRedis();
  const { app } = await import('./app.js');
  const databaseConnected = await connectDatabase();
  if (env.NODE_ENV === 'production' && !databaseConnected) {
    throw new Error('Production startup requires a successful MongoDB connection.');
  }
  if (databaseConnected) await assertProductionReplicaSet();
  if (databaseConnected) await getStoreSettings();

  const server = app.listen(env.PORT, () => {
    console.log(`The Fashion Store API is running at http://localhost:${env.PORT}`);
    console.log(`Health check: http://localhost:${env.PORT}/api/v1/health`);
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;

  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error('The API server could not listen.', {
      code: error.code ?? 'UNKNOWN',
      port: env.PORT,
    });
    process.exitCode = 1;
    void disconnectDependencies();
  });

  let isShuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Received ${signal}; draining API requests.`);
    const forceCloseTimer = setTimeout(() => {
      console.error('API graceful shutdown timed out; closing active connections.');
      server.closeAllConnections();
    }, 30_000);
    forceCloseTimer.unref();

    server.close(() => {
      clearTimeout(forceCloseTimer);
      void disconnectDependencies().then(
        () => {
          process.exitCode = 0;
        },
        (error: unknown) => {
          console.error('MongoDB disconnect during shutdown failed.', {
            reason: error instanceof Error ? error.name : 'unknown',
          });
          process.exitCode = 1;
        },
      );
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

async function disconnectDependencies(): Promise<void> {
  const results = await Promise.allSettled([disconnectDatabase(), disconnectRateLimitRedis()]);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('API dependency disconnect failed.', {
        reason: result.reason instanceof Error ? result.reason.name : 'unknown',
      });
    }
  }
}

startServer().catch(async (error: unknown) => {
  console.error('Failed to start API server.', {
    reason:
      env.NODE_ENV === 'production'
        ? error instanceof Error
          ? error.name
          : 'unknown'
        : error instanceof Error
          ? error.message
          : 'unknown',
  });
  await disconnectDependencies();
  process.exitCode = 1;
});

import { app } from './app.js';
import { assertProductionReplicaSet, connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { getStoreSettings } from './services/store-settings.service.js';

async function startServer() {
  const databaseConnected = await connectDatabase();
  if (databaseConnected) await assertProductionReplicaSet();
  if (databaseConnected) await getStoreSettings();

  app.listen(env.PORT, () => {
    console.log(`The Fashion Store API is running at http://localhost:${env.PORT}`);
    console.log(`Health check: http://localhost:${env.PORT}/api/v1/health`);
  });
}

startServer().catch((error: unknown) => {
  console.error('Failed to start API server:', error);
  process.exit(1);
});

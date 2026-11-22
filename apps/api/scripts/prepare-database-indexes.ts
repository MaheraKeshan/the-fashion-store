import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/database.js';
import '../src/models/admin-audit-event.js';
import '../src/models/admin-session.js';
import '../src/models/admin-user.js';
import '../src/models/category.js';
import '../src/models/collection.js';
import '../src/models/customer-password-reset.js';
import '../src/models/customer-session.js';
import '../src/models/customer.js';
import '../src/models/order.js';
import '../src/models/product-variant.js';
import '../src/models/product.js';
import '../src/models/store-settings.js';

async function prepareDatabaseIndexes() {
  if (!(await connectDatabase())) {
    throw new Error('A connected MongoDB database is required to prepare indexes.');
  }

  for (const model of mongoose.modelNames()) {
    const indexes = await mongoose.model(model).createIndexes();
    console.log(`${model}: ${indexes.length} indexes ready.`);
  }
}

prepareDatabaseIndexes()
  .catch((error: unknown) => {
    console.error('Database index preparation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

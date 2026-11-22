import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { AdminAuditEvent } from '../models/admin-audit-event.js';
import { AdminUser } from '../models/admin-user.js';
import { createAdminAccountSchema } from '../schemas/admin-auth.js';
import { hashAdminPassword } from '../services/admin-auth.service.js';

async function createInitialAdmin() {
  const input = createAdminAccountSchema.parse({
    email: process.env.ADMIN_INITIAL_EMAIL,
    password: process.env.ADMIN_INITIAL_PASSWORD,
  });
  if (!(await connectDatabase())) {
    throw new Error('A connected MongoDB database is required to create an administrator.');
  }
  if (await AdminUser.exists({ role: 'admin', isActive: true })) {
    throw new Error(
      'An active administrator already exists; bootstrap account creation was refused.',
    );
  }

  const passwordHash = await hashAdminPassword(input.password);
  const session = await mongoose.startSession();
  try {
    const createdAdminId = await session.withTransaction(async () => {
      if (await AdminUser.exists({ role: 'admin', isActive: true }).session(session)) {
        throw new Error(
          'An active administrator already exists; bootstrap account creation was refused.',
        );
      }

      const [admin] = await AdminUser.create(
        [{ email: input.email, passwordHash, role: 'admin', isActive: true }],
        { session },
      );
      await AdminAuditEvent.create(
        [
          {
            actorUserId: admin._id,
            action: 'admin.account.created',
            resourceType: 'admin-user',
            resourceId: admin._id.toString(),
            before: null,
            after: { email: admin.email, role: admin.role },
          },
        ],
        { session },
      );
      return admin._id.toString();
    });
    if (!createdAdminId) throw new Error('The administrator account was not created.');
  } finally {
    await session.endSession();
  }

  console.log(
    `Administrator account created for ${input.email}. Remove bootstrap credentials now.`,
  );
}

createInitialAdmin()
  .catch((error: unknown) => {
    console.error('Administrator account creation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

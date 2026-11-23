import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Customer } from '../src/models/customer.js';
import { CustomerPasswordReset } from '../src/models/customer-password-reset.js';
import { CustomerSession } from '../src/models/customer-session.js';
import { customerAuthService } from '../src/services/customer-auth.service.js';

test('password changes revoke other sessions atomically and reset tokens are one-time', async (testContext) => {
  let replSet: MongoMemoryReplSet | undefined;

  try {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, name: 'customer-auth-integration-rs' },
    });
  } catch (error) {
    testContext.skip(
      `MongoDB replica-set integration unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  try {
    await mongoose.connect(replSet.getUri(), {
      dbName: 'fashion_store_customer_auth_integration',
      serverSelectionTimeoutMS: 5000,
    });
    await mongoose.connection.db?.dropDatabase();
    await Promise.all([
      Customer.syncIndexes(),
      CustomerSession.syncIndexes(),
      CustomerPasswordReset.syncIndexes(),
    ]);

    const registration = await customerAuthService.register(
      'Integration Customer',
      'customer-auth-integration@example.com',
      'initial-customer-password',
    );
    const sessionContext = await customerAuthService.resolveSession(registration.token);
    assert.ok(sessionContext);

    await CustomerSession.create({
      customerId: sessionContext.actor.id,
      tokenHash: 'other-session-token-hash',
      csrfToken: 'other-session-csrf-token',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await customerAuthService.changePassword(
      sessionContext,
      'initial-customer-password',
      'changed-customer-password',
    );
    const activeSessions = await CustomerSession.find({ customerId: sessionContext.actor.id })
      .select('tokenHash')
      .lean()
      .exec();
    assert.equal(activeSessions.length, 1);
    assert.equal(activeSessions[0].tokenHash, sessionContext.tokenHash);

    const resetToken = 'a'.repeat(43);
    const tokenHash = createHash('sha256').update(resetToken).digest('hex');
    await CustomerPasswordReset.create({
      customerId: sessionContext.actor.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const resetResults = await Promise.allSettled([
      customerAuthService.completePasswordReset(resetToken, 'reset-password-choice-one'),
      customerAuthService.completePasswordReset(resetToken, 'reset-password-choice-two'),
    ]);
    assert.equal(resetResults.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(resetResults.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(await CustomerSession.countDocuments({ customerId: sessionContext.actor.id }), 0);
    assert.equal(
      await CustomerPasswordReset.countDocuments({ customerId: sessionContext.actor.id }),
      0,
    );
  } finally {
    await mongoose.disconnect();
    await replSet?.stop();
  }
});

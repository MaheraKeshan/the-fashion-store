import assert from 'node:assert/strict';
import test from 'node:test';
import { adminLoginSchema, createAdminAccountSchema } from '../src/schemas/admin-auth.js';
import { hashAdminPassword, verifyAdminPassword } from '../src/services/admin-auth.service.js';
import { AdminSession } from '../src/models/admin-session.js';
import { AdminUser } from '../src/models/admin-user.js';

test('administrator login normalizes email and rejects extra credential fields', () => {
  const result = adminLoginSchema.safeParse({
    email: ' ADMIN@EXAMPLE.COM ',
    password: 'a long enough test password',
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.email, 'admin@example.com');
  assert.equal(
    adminLoginSchema.safeParse({
      email: 'admin@example.com',
      password: 'password',
      role: 'admin',
    }).success,
    false,
  );
});

test('bootstrap administrator passwords require at least fourteen characters', () => {
  assert.equal(
    createAdminAccountSchema.safeParse({
      email: 'admin@example.com',
      password: 'TooShort123',
    }).success,
    false,
  );
  assert.equal(
    createAdminAccountSchema.safeParse({
      email: 'admin@example.com',
      password: 'longer-admin-password',
    }).success,
    true,
  );
});

test('administrator passwords use salted scrypt hashes and verify without storing plaintext', async () => {
  const password = 'a unique long administrator password';
  const passwordHash = await hashAdminPassword(password);

  assert.match(passwordHash, /^scrypt\$32768\$8\$1\$[a-f\d]{32}\$[a-f\d]{128}$/);
  assert.notEqual(passwordHash, password);
  assert.equal(await verifyAdminPassword(password, passwordHash), true);
  assert.equal(await verifyAdminPassword('different password', passwordHash), false);
});

test('admin password and session secrets are excluded from default database projections', () => {
  assert.equal(AdminUser.schema.path('passwordHash')?.options.select, false);
  assert.equal(AdminSession.schema.path('tokenHash')?.options.select, false);
  assert.equal(AdminSession.schema.path('csrfToken')?.options.select, false);
  assert.equal(AdminSession.schema.path('expiresAt')?.options.expires, 0);
});

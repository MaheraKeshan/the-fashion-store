import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import { getDatabaseStatus } from '../config/database.js';
import { ADMIN_SESSION_TTL_MS } from '../constants/admin-session.js';
import { AdminAuditEvent } from '../models/admin-audit-event.js';
import { AdminSession } from '../models/admin-session.js';
import { AdminUser } from '../models/admin-user.js';
import { ProductServiceError } from './product.service.js';

const scryptCost = 32768;
const scryptBlockSize = 8;
const scryptParallelization = 1;
const derivedKeyLength = 64;

export interface AdminActor {
  id: string;
  email: string;
  role: 'admin';
}

export interface AdminSessionContext {
  actor: AdminActor;
  csrfToken: string;
  tokenHash: string;
  expiresAt: string;
}

function assertDatabaseConnected() {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('Administrator authentication is temporarily unavailable.', 503);
  }
}

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      derivedKeyLength,
      {
        N: scryptCost,
        r: scryptBlockSize,
        p: scryptParallelization,
        maxmem: 64 * 1024 * 1024,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashAdminPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derivePasswordKey(password, salt);
  return `scrypt$${scryptCost}$${scryptBlockSize}$${scryptParallelization}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyAdminPassword(password: string, passwordHash: string) {
  const [algorithm, cost, blockSize, parallelization, saltHex, keyHex] = passwordHash.split('$');
  if (
    algorithm !== 'scrypt' ||
    cost !== String(scryptCost) ||
    blockSize !== String(scryptBlockSize) ||
    parallelization !== String(scryptParallelization) ||
    !/^[a-f\d]{32}$/i.test(saltHex ?? '') ||
    !/^[a-f\d]{128}$/i.test(keyHex ?? '')
  ) {
    return false;
  }

  const expectedKey = Buffer.from(keyHex, 'hex');
  const actualKey = await derivePasswordKey(password, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(actualKey, expectedKey);
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function isTransactionUnsupportedError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 20;
}

export async function createAdminSession(email: string, password: string) {
  assertDatabaseConnected();

  const user = await AdminUser.findOne({ email, role: 'admin', isActive: true })
    .select('+passwordHash')
    .exec();
  let passwordMatches = false;
  if (user) {
    passwordMatches = await verifyAdminPassword(password, user.passwordHash);
  } else {
    await derivePasswordKey(password, randomBytes(16));
  }
  if (!user || !passwordMatches) {
    throw new ProductServiceError('The email or password is incorrect.', 401);
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await AdminSession.create([{ userId: user._id, tokenHash, csrfToken, expiresAt }], {
        session,
      });
      await AdminAuditEvent.create(
        [
          {
            actorUserId: user._id,
            action: 'admin.session.created',
            resourceType: 'admin-session',
            resourceId: user._id.toString(),
            before: null,
            after: { expiresAt },
          },
        ],
        { session },
      );
    });
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      throw new ProductServiceError(
        'Administrator access requires MongoDB replica set transactions.',
        503,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return {
    token,
    csrfToken,
    expiresAt: expiresAt.toISOString(),
    user: { email: user.email, role: 'admin' as const },
  };
}

export async function resolveAdminSession(token: string): Promise<AdminSessionContext | null> {
  assertDatabaseConnected();
  const tokenHash = hashSessionToken(token);
  const session = await AdminSession.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
  })
    .select('+csrfToken')
    .lean()
    .exec();
  if (!session) return null;

  const user = await AdminUser.findOne({
    _id: session.userId,
    role: 'admin',
    isActive: true,
  })
    .select('email role')
    .lean()
    .exec();
  if (!user) return null;

  return {
    actor: { id: user._id.toString(), email: user.email, role: 'admin' },
    csrfToken: session.csrfToken,
    tokenHash,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function revokeAdminSession(context: AdminSessionContext) {
  assertDatabaseConnected();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const revokedSession = await AdminSession.findOneAndDelete({
        tokenHash: context.tokenHash,
      })
        .session(session)
        .exec();
      if (!revokedSession) return;

      await AdminAuditEvent.create(
        [
          {
            actorUserId: revokedSession.userId,
            action: 'admin.session.revoked',
            resourceType: 'admin-session',
            resourceId: revokedSession.userId.toString(),
            before: { expiresAt: revokedSession.expiresAt },
            after: { revoked: true },
          },
        ],
        { session },
      );
    });
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      throw new ProductServiceError(
        'Administrator access requires MongoDB replica set transactions.',
        503,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import { getDatabaseStatus } from '../config/database.js';
import { CUSTOMER_SESSION_TTL_MS } from '../constants/customer-session.js';
import { Customer } from '../models/customer.js';
import { CustomerSession } from '../models/customer-session.js';
import { CustomerPasswordReset } from '../models/customer-password-reset.js';
import { Order } from '../models/order.js';
import { env } from '../config/env.js';
import { ProductServiceError } from './product.service.js';

class PasswordHasher {
  private readonly cost = 32768;
  private readonly blockSize = 8;
  private readonly parallelization = 1;
  private readonly keyLength = 64;

  derive(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        this.keyLength,
        { N: this.cost, r: this.blockSize, p: this.parallelization, maxmem: 64 * 1024 * 1024 },
        (error, key) => {
          if (error) reject(error);
          else resolve(key);
        },
      );
    });
  }

  async hash(password: string) {
    const salt = randomBytes(16);
    const key = await this.derive(password, salt);
    return `scrypt$${this.cost}$${this.blockSize}$${this.parallelization}$${salt.toString('hex')}$${key.toString('hex')}`;
  }

  async verify(password: string, passwordHash: string) {
    const [algorithm, cost, blockSize, parallelization, saltHex, keyHex] = passwordHash.split('$');
    if (
      algorithm !== 'scrypt' ||
      cost !== String(this.cost) ||
      blockSize !== String(this.blockSize) ||
      parallelization !== String(this.parallelization) ||
      !/^[a-f\d]{32}$/i.test(saltHex ?? '') ||
      !/^[a-f\d]{128}$/i.test(keyHex ?? '')
    ) {
      return false;
    }
    const expectedKey = Buffer.from(keyHex, 'hex');
    const actualKey = await this.derive(password, Buffer.from(saltHex, 'hex'));
    return timingSafeEqual(actualKey, expectedKey);
  }
}

export interface CustomerActor {
  id: string;
  name: string;
  email: string;
  phone?: string;
  deliveryAddress?: {
    line1: string;
    line2?: string;
    area: string;
    postalCode?: string;
    instructions?: string;
  };
}

export interface CustomerSessionContext {
  actor: CustomerActor;
  csrfToken: string;
  tokenHash: string;
  expiresAt: string;
}

class CustomerAuthService {
  constructor(private readonly passwordHasher = new PasswordHasher()) {}

  private assertDatabaseConnected() {
    if (getDatabaseStatus() !== 'connected') {
      throw new ProductServiceError('Customer accounts are temporarily unavailable.', 503);
    }
  }

  private hashSessionToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private isTransactionUnsupportedError(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 20;
  }

  async register(name: string, email: string, password: string) {
    this.assertDatabaseConnected();
    const passwordHash = await this.passwordHasher.hash(password);
    const customer = await Customer.create({ name, email, passwordHash });
    return this.createSession(customer);
  }

  async login(email: string, password: string) {
    this.assertDatabaseConnected();
    const customer = await Customer.findOne({ email, isActive: true })
      .select('+passwordHash')
      .exec();
    let passwordMatches = false;
    if (customer)
      passwordMatches = await this.passwordHasher.verify(password, customer.passwordHash);
    else await this.passwordHasher.derive(password, randomBytes(16));
    if (!customer || !passwordMatches) {
      throw new ProductServiceError('The email or password is incorrect.', 401);
    }
    return this.createSession(customer);
  }

  private async createSession(customer: {
    _id: mongoose.Types.ObjectId;
    name: string;
    email: string;
  }) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashSessionToken(token);
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_TTL_MS);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await CustomerSession.create(
          [{ customerId: customer._id, tokenHash, csrfToken, expiresAt }],
          { session },
        );
      });
    } catch (error) {
      if (this.isTransactionUnsupportedError(error)) {
        throw new ProductServiceError('Customer sessions require MongoDB transactions.', 503);
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return {
      token,
      csrfToken,
      expiresAt: expiresAt.toISOString(),
      user: { name: customer.name, email: customer.email },
    };
  }

  async resolveSession(token: string): Promise<CustomerSessionContext | null> {
    this.assertDatabaseConnected();
    const tokenHash = this.hashSessionToken(token);
    const session = await CustomerSession.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    })
      .select('+csrfToken')
      .lean()
      .exec();
    if (!session) return null;
    const customer = await Customer.findOne({ _id: session.customerId, isActive: true })
      .select('name email phone deliveryAddress')
      .lean()
      .exec();
    if (!customer) return null;
    return {
      actor: {
        id: customer._id.toString(),
        name: customer.name,
        email: customer.email,
        ...(customer.phone && { phone: customer.phone }),
        ...(customer.deliveryAddress?.line1 &&
          customer.deliveryAddress.area && {
            deliveryAddress: {
              line1: customer.deliveryAddress.line1,
              ...(customer.deliveryAddress.line2 && { line2: customer.deliveryAddress.line2 }),
              area: customer.deliveryAddress.area,
              ...(customer.deliveryAddress.postalCode && {
                postalCode: customer.deliveryAddress.postalCode,
              }),
              ...(customer.deliveryAddress.instructions && {
                instructions: customer.deliveryAddress.instructions,
              }),
            },
          }),
      },
      csrfToken: session.csrfToken,
      tokenHash,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async revokeSession(context: CustomerSessionContext) {
    this.assertDatabaseConnected();
    await CustomerSession.findOneAndDelete({ tokenHash: context.tokenHash }).exec();
  }

  async updateProfile(customerId: string, name: string, phone?: string) {
    this.assertDatabaseConnected();
    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, isActive: true },
      { name, ...(phone ? { phone } : { $unset: { phone: '' } }) },
      { new: true, runValidators: true },
    )
      .select('name email phone deliveryAddress')
      .exec();
    if (!customer) throw new ProductServiceError('Customer account could not be found.', 404);
    return {
      name: customer.name,
      email: customer.email,
      ...(customer.phone && { phone: customer.phone }),
      ...(customer.deliveryAddress?.line1 && { deliveryAddress: customer.deliveryAddress }),
    };
  }

  async updateDeliveryAddress(
    customerId: string,
    address: {
      line1: string;
      line2?: string;
      area: string;
      postalCode?: string;
      instructions?: string;
    },
  ) {
    this.assertDatabaseConnected();
    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, isActive: true },
      { deliveryAddress: address },
      { new: true, runValidators: true },
    )
      .select('name email phone deliveryAddress')
      .exec();
    if (!customer) throw new ProductServiceError('Customer account could not be found.', 404);
    return {
      name: customer.name,
      email: customer.email,
      ...(customer.phone && { phone: customer.phone }),
      ...(customer.deliveryAddress?.line1 && { deliveryAddress: customer.deliveryAddress }),
    };
  }

  async changePassword(
    context: CustomerSessionContext,
    currentPassword: string,
    newPassword: string,
  ) {
    this.assertDatabaseConnected();
    const customer = await Customer.findById(context.actor.id).select('+passwordHash').exec();
    if (!customer || !(await this.passwordHasher.verify(currentPassword, customer.passwordHash))) {
      throw new ProductServiceError('The current password is incorrect.', 401);
    }
    if (await this.passwordHasher.verify(newPassword, customer.passwordHash)) {
      throw new ProductServiceError('Choose a password different from the current password.', 422);
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const update = await Customer.updateOne(
          {
            _id: customer._id,
            isActive: true,
            passwordHash: customer.passwordHash,
          },
          { $set: { passwordHash } },
          { session, runValidators: true },
        ).exec();
        if (update.matchedCount !== 1) {
          throw new ProductServiceError('The current password is incorrect.', 401);
        }
        await CustomerSession.deleteMany(
          {
            customerId: customer._id,
            tokenHash: { $ne: context.tokenHash },
          },
          { session },
        ).exec();
      });
    } catch (error) {
      if (this.isTransactionUnsupportedError(error)) {
        throw new ProductServiceError('Changing a password requires MongoDB transactions.', 503);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async deleteAccount(context: CustomerSessionContext, currentPassword: string) {
    this.assertDatabaseConnected();
    const customer = await Customer.findOne({ _id: context.actor.id, isActive: true })
      .select('+passwordHash')
      .exec();
    if (!customer || !(await this.passwordHasher.verify(currentPassword, customer.passwordHash))) {
      throw new ProductServiceError('The current password is incorrect.', 401);
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const activeSession = await CustomerSession.exists({
          customerId: customer._id,
          tokenHash: context.tokenHash,
          expiresAt: { $gt: new Date() },
        })
          .session(session)
          .exec();
        if (!activeSession) {
          throw new ProductServiceError('Your customer session has expired.', 401);
        }

        await Order.updateMany(
          { customerId: customer._id },
          {
            $set: {
              'customer.name': 'Deleted customer',
              'customer.phone': 'REDACTED',
              'deliveryAddress.line1': 'Removed',
              'deliveryAddress.area': 'Removed',
              requestHash: randomBytes(32).toString('hex'),
            },
            $unset: {
              customerId: 1,
              'customer.email': 1,
              'deliveryAddress.line2': 1,
              'deliveryAddress.postalCode': 1,
              'deliveryAddress.instructions': 1,
            },
          },
          { session, runValidators: true },
        ).exec();

        await CustomerSession.deleteMany({ customerId: customer._id }, { session }).exec();
        await CustomerPasswordReset.deleteMany({ customerId: customer._id }, { session }).exec();
        const deletedCustomer = await Customer.deleteOne(
          {
            _id: customer._id,
            isActive: true,
            passwordHash: customer.passwordHash,
          },
          { session },
        ).exec();
        if (deletedCustomer.deletedCount !== 1) {
          throw new ProductServiceError(
            'The account changed during deletion. Sign in and try again.',
            409,
          );
        }
      });
    } catch (error) {
      if (this.isTransactionUnsupportedError(error)) {
        throw new ProductServiceError('Account deletion requires MongoDB transactions.', 503);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async listSessions(context: CustomerSessionContext) {
    this.assertDatabaseConnected();
    const sessions = await CustomerSession.find({
      customerId: context.actor.id,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .select('_id createdAt expiresAt tokenHash')
      .lean()
      .exec();

    return sessions.map((session) => ({
      id: session._id.toString(),
      isCurrent: session.tokenHash === context.tokenHash,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }));
  }

  async revokeOtherSessions(context: CustomerSessionContext) {
    this.assertDatabaseConnected();
    await CustomerSession.deleteMany({
      customerId: context.actor.id,
      tokenHash: { $ne: context.tokenHash },
    }).exec();
  }

  async requestPasswordReset(email: string) {
    this.assertDatabaseConnected();
    const customer = await Customer.findOne({ email, isActive: true })
      .select('_id email')
      .lean()
      .exec();
    if (!customer) return;

    await CustomerPasswordReset.deleteMany({ customerId: customer._id }).exec();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashSessionToken(token);
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
    await CustomerPasswordReset.create({ customerId: customer._id, tokenHash, expiresAt });

    if (env.PASSWORD_RESET_WEBHOOK_URL) {
      try {
        const response = await fetch(env.PASSWORD_RESET_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: customer.email,
            resetToken: token,
            expiresAt: expiresAt.toISOString(),
            resetUrl: `${env.CLIENT_URL}/account/reset-password?token=${encodeURIComponent(token)}`,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          console.error('Password reset delivery webhook returned an unsuccessful status.', {
            status: response.status,
          });
        }
      } catch (error) {
        console.error('Password reset delivery webhook failed.', {
          reason: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
  }

  async completePasswordReset(token: string, newPassword: string) {
    this.assertDatabaseConnected();
    const tokenHash = this.hashSessionToken(token);
    const reset = await CustomerPasswordReset.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    }).exec();
    if (!reset) {
      throw new ProductServiceError('The password reset link is invalid or has expired.', 400);
    }

    const customer = await Customer.findById(reset.customerId).select('+passwordHash').exec();
    if (!customer || !customer.isActive) {
      throw new ProductServiceError('The password reset request could not be completed.', 400);
    }
    if (await this.passwordHasher.verify(newPassword, customer.passwordHash)) {
      throw new ProductServiceError('Choose a password different from the current password.', 422);
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const consumedReset = await CustomerPasswordReset.findOneAndDelete({
          _id: reset._id,
          tokenHash,
          expiresAt: { $gt: new Date() },
        })
          .session(session)
          .exec();
        if (!consumedReset) {
          throw new ProductServiceError('The password reset link is invalid or has expired.', 400);
        }
        const updatedCustomer = await Customer.findOneAndUpdate(
          { _id: customer._id, isActive: true, passwordHash: customer.passwordHash },
          { $set: { passwordHash } },
          { session, runValidators: true },
        ).exec();
        if (!updatedCustomer) {
          throw new ProductServiceError('The password reset request could not be completed.', 400);
        }
        await CustomerPasswordReset.deleteMany({ customerId: customer._id }, { session }).exec();
        await CustomerSession.deleteMany({ customerId: customer._id }, { session }).exec();
      });
    } catch (error) {
      if (this.isTransactionUnsupportedError(error)) {
        throw new ProductServiceError('Password reset requires MongoDB transactions.', 503);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

export const customerAuthService = new CustomerAuthService();

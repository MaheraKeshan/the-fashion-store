import mongoose from 'mongoose';
import { AdminAuditEvent } from '../models/admin-audit-event.js';
import { StoreSettings, initialDeliveryAreas } from '../models/store-settings.js';
import type { UpdateDeliverySettings } from '../schemas/store-settings.js';
import { getDatabaseStatus } from '../config/database.js';
import { ProductServiceError } from './product.service.js';

function assertDatabaseConnected() {
  if (getDatabaseStatus() !== 'connected') {
    throw new ProductServiceError('Store delivery settings are temporarily unavailable.', 503);
  }
}

export async function getStoreSettings() {
  assertDatabaseConnected();

  try {
    const settings = await StoreSettings.findOneAndUpdate(
      { storeKey: 'default' },
      {
        $set: { currency: 'LKR' },
        $setOnInsert: {
          storeKey: 'default',
          deliveryPricingMethod: 'flat',
          deliveryFeeLkr: 350,
          deliveryAreaFees: [],
          coveredAreas: initialDeliveryAreas,
          deliveryConfirmed: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .lean()
      .exec();
    if (!settings) {
      throw new ProductServiceError('Store delivery settings could not be loaded.', 500);
    }
    return settings;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const settings = await StoreSettings.findOne({ storeKey: 'default' }).lean().exec();
      if (settings) return settings;
    }
    throw error;
  }
}

export async function updateDeliverySettings(input: UpdateDeliverySettings, actorUserId: string) {
  assertDatabaseConnected();

  const setFields: Record<string, unknown> = {
    currency: 'LKR',
    deliveryPricingMethod: input.pricingMethod,
    coveredAreas: input.coveredAreas,
    deliveryConfirmed: input.confirmedForProduction,
  };

  if (input.pricingMethod === 'flat') {
    setFields.deliveryFeeLkr = input.deliveryFeeLkr;
    setFields.deliveryAreaFees = [];
  } else {
    setFields.deliveryFeeLkr = null;
    setFields.deliveryAreaFees = input.deliveryAreaFees;
  }

  const session = await mongoose.startSession();
  try {
    const settings = await session.withTransaction(async () => {
      const previousSettings = await StoreSettings.findOne({ storeKey: 'default' })
        .session(session)
        .lean()
        .exec();
      const updatedSettings = await StoreSettings.findOneAndUpdate(
        { storeKey: 'default' },
        {
          $set: setFields,
          $setOnInsert: { storeKey: 'default' },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session },
      )
        .lean()
        .exec();
      if (!updatedSettings) {
        throw new ProductServiceError('Store delivery settings could not be updated.', 500);
      }

      await AdminAuditEvent.create(
        [
          {
            actorUserId,
            action: 'delivery.settings.updated',
            resourceType: 'store-settings',
            resourceId: 'default',
            before: toDeliveryAuditSnapshot(previousSettings),
            after: toDeliveryAuditSnapshot(updatedSettings),
          },
        ],
        { session },
      );
      return updatedSettings;
    });
    if (!settings) {
      throw new ProductServiceError('Store delivery settings could not be updated.', 500);
    }
    return settings;
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      throw new ProductServiceError(
        'Administrator changes require MongoDB replica set transactions.',
        503,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

function toDeliveryAuditSnapshot(
  settings: {
    currency: string;
    deliveryPricingMethod: string;
    deliveryFeeLkr?: number | null;
    deliveryAreaFees: Array<{ area: string; feeLkr: number }>;
    coveredAreas: string[];
    deliveryConfirmed: boolean;
  } | null,
) {
  if (!settings) return null;
  return {
    currency: settings.currency,
    pricingMethod: settings.deliveryPricingMethod,
    deliveryFeeLkr: settings.deliveryFeeLkr ?? null,
    deliveryAreaFees: settings.deliveryAreaFees,
    coveredAreas: settings.coveredAreas,
    confirmedForProduction: settings.deliveryConfirmed,
  };
}

function isTransactionUnsupportedError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 20;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

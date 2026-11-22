import assert from 'node:assert/strict';
import test from 'node:test';
import { StoreSettings } from '../src/models/store-settings.js';
import { updateDeliverySettingsSchema } from '../src/schemas/store-settings.js';

const coveredAreas = ['Colombo 01', 'Dehiwala'];

test('initial delivery settings are configured but not live until confirmed', () => {
  const settings = new StoreSettings();

  assert.equal(settings.currency, 'LKR');
  assert.equal(settings.deliveryFeeLkr, 350);
  assert.equal(settings.deliveryConfirmed, false);
  assert.ok(settings.coveredAreas.includes('Colombo 15'));
  assert.ok(settings.coveredAreas.includes('Sri Jayawardenepura Kotte'));
  assert.equal(settings.validateSync(), undefined);
});

test('flat delivery settings accept an explicit fee, coverage and confirmation state', () => {
  const result = updateDeliverySettingsSchema.safeParse({
    pricingMethod: 'flat',
    deliveryFeeLkr: 350,
    coveredAreas,
    confirmedForProduction: false,
  });

  assert.equal(result.success, true);
});

test('delivery settings reject duplicate areas and incomplete area-based fees', () => {
  const duplicateAreas = updateDeliverySettingsSchema.safeParse({
    pricingMethod: 'flat',
    deliveryFeeLkr: 350,
    coveredAreas: ['Dehiwala', ' dehiwala '],
    confirmedForProduction: false,
  });
  const missingAreaFee = updateDeliverySettingsSchema.safeParse({
    pricingMethod: 'area-based',
    deliveryAreaFees: [{ area: 'Colombo 01', feeLkr: 350 }],
    coveredAreas,
    confirmedForProduction: false,
  });

  assert.equal(duplicateAreas.success, false);
  assert.equal(missingAreaFee.success, false);
});

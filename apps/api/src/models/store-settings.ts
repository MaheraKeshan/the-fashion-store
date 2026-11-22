import { Schema, model } from 'mongoose';

export const initialDeliveryAreas = [
  ...Array.from({ length: 15 }, (_, index) => `Colombo ${String(index + 1).padStart(2, '0')}`),
  'Dehiwala',
  'Mount Lavinia',
  'Nugegoda',
  'Maharagama',
  'Boralesgamuwa',
  'Battaramulla',
  'Rajagiriya',
  'Sri Jayawardenepura Kotte',
  'Piliyandala',
  'Moratuwa',
];

const areaFeeSchema = new Schema(
  {
    area: { type: String, required: true, trim: true },
    feeLkr: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isSafeInteger },
    },
  },
  { _id: false },
);

const storeSettingsSchema = new Schema(
  {
    storeKey: { type: String, required: true, unique: true, default: 'default' },
    currency: { type: String, enum: ['LKR'], default: 'LKR', required: true },
    deliveryPricingMethod: {
      type: String,
      enum: ['flat', 'area-based'],
      default: 'flat',
      required: true,
    },
    deliveryFeeLkr: {
      type: Number,
      min: 0,
      default: 350,
      validate: {
        validator: (value: number | null) => value === null || Number.isSafeInteger(value),
      },
    },
    deliveryAreaFees: { type: [areaFeeSchema], default: [] },
    coveredAreas: { type: [String], default: initialDeliveryAreas },
    deliveryConfirmed: { type: Boolean, default: false, required: true },
  },
  { timestamps: true, collection: 'store_settings' },
);

export const StoreSettings = model('StoreSettings', storeSettingsSchema);

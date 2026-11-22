import { Schema, model } from 'mongoose';

const customerPasswordResetSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, collection: 'customer_password_resets' },
);

export const CustomerPasswordReset = model(
  'CustomerPasswordReset',
  customerPasswordResetSchema,
);

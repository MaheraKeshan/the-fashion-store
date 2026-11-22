import { Schema, model } from 'mongoose';

const customerSessionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    csrfToken: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, collection: 'customer_sessions' },
);

export const CustomerSession = model('CustomerSession', customerSessionSchema);

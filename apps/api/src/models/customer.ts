import { Schema, model } from 'mongoose';

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true, maxlength: 20 },
    deliveryAddress: {
      line1: { type: String, trim: true, maxlength: 200 },
      line2: { type: String, trim: true, maxlength: 200 },
      area: { type: String, trim: true, maxlength: 100 },
      postalCode: { type: String, trim: true, maxlength: 5 },
      instructions: { type: String, trim: true, maxlength: 300 },
    },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'customers' },
);

export const Customer = model('Customer', customerSchema);

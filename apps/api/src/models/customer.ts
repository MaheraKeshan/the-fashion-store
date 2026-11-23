import { Schema, model } from 'mongoose';

const savedCartItemSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      validate: Number.isSafeInteger,
    },
  },
  { _id: false },
);

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
    cartItems: {
      type: [savedCartItemSchema],
      default: [],
      select: false,
      validate: {
        validator: (items: { variantId: Schema.Types.ObjectId }[]) =>
          items.length <= 50 &&
          new Set(items.map((item) => item.variantId.toString())).size === items.length,
        message: 'A saved cart must contain at most 50 unique variants.',
      },
    },
    wishlistProductIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
      default: [],
      select: false,
      validate: {
        validator: (productIds: Schema.Types.ObjectId[]) =>
          productIds.length <= 100 &&
          new Set(productIds.map((productId) => productId.toString())).size === productIds.length,
        message: 'A wishlist must contain at most 100 unique products.',
      },
    },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'customers' },
);

export const Customer = model('Customer', customerSchema);

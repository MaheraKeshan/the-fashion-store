import { Schema, model } from 'mongoose';
import { ORDER_STATUSES } from '../domain/order-status.js';

const orderItemSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    productName: { type: String, required: true, trim: true },
    productSlug: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    size: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      validate: { validator: Number.isSafeInteger },
    },
    unitPriceLkr: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isSafeInteger },
    },
    lineTotalLkr: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isSafeInteger },
    },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, immutable: true },
    idempotencyKey: { type: String, required: true, unique: true, immutable: true },
    requestHash: { type: String, select: false },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, trim: true },
    },
    deliveryAddress: {
      line1: { type: String, required: true, trim: true },
      line2: { type: String, trim: true },
      area: { type: String, required: true, trim: true },
      postalCode: { type: String, trim: true },
      instructions: { type: String, trim: true },
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: (items: unknown[]) => items.length > 0,
    },
    currency: { type: String, enum: ['LKR'], required: true, default: 'LKR' },
    subtotalLkr: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isSafeInteger },
    },
    deliveryFeeLkr: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isSafeInteger },
    },
    totalLkr: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isSafeInteger },
    },
    paymentMethod: {
      type: String,
      enum: ['cash-on-delivery', 'payhere'],
      required: true,
      default: 'cash-on-delivery',
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      required: true,
      default: 'unpaid',
    },
    paymentReference: { type: String, trim: true, maxlength: 100 },
    paymentPaidAt: { type: Date },
    cancellation: {
      reason: { type: String, trim: true, maxlength: 300 },
      cancelledAt: { type: Date },
      cancelledBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      required: true,
      default: 'pending',
    },
  },
  { timestamps: true, collection: 'orders' },
);

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ customerId: 1, createdAt: -1, _id: -1 });

export const Order = model('Order', orderSchema);

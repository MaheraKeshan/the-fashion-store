import { Schema, model } from 'mongoose';

const productVariantSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    size: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Price must be a whole number of rupees.',
      },
    },
    compareAtPrice: {
      type: Number,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Compare-at price must be a whole number of rupees.',
      },
    },
    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Stock must be a non-negative whole number.',
      },
    },
    isActive: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, collection: 'product_variants' },
);

productVariantSchema.index({ sku: 1 }, { unique: true });
productVariantSchema.index(
  { productId: 1, size: 1, color: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
productVariantSchema.index({ productId: 1, isActive: 1, price: 1 });

export const ProductVariant = model('ProductVariant', productVariantSchema);

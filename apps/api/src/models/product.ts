import { Schema, model } from 'mongoose';

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    collectionIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Collection' }],
      default: [],
    },
    gender: { type: String, required: true, enum: ['women', 'men', 'kids', 'unisex'] },
    tags: { type: [String], default: [] },
    images: {
      type: [
        new Schema(
          {
            url: { type: String, required: true, trim: true },
            alt: { type: String, required: true, trim: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    brand: { type: String, trim: true },
    isActive: { type: Boolean, default: true, required: true },
    isFeatured: { type: Boolean, default: false, required: true },
  },
  { timestamps: true, collection: 'products' },
);

productSchema.index({ isActive: 1, categoryId: 1, createdAt: -1 });
productSchema.index({ isActive: 1, collectionIds: 1, createdAt: -1 });
productSchema.index({ isActive: 1, gender: 1, createdAt: -1 });

export const Product = model('Product', productSchema);

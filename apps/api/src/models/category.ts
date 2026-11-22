import { Schema, model } from 'mongoose';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    isActive: { type: Boolean, default: true, required: true },
    sortOrder: { type: Number, min: 0, default: 0, required: true },
  },
  { timestamps: true, collection: 'categories' },
);

categorySchema.index({ parentId: 1, isActive: 1, sortOrder: 1 });

export const Category = model('Category', categorySchema);

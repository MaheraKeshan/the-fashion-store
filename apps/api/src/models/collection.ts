import { Schema, model } from 'mongoose';

const collectionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, collection: 'collections' },
);

export const Collection = model('Collection', collectionSchema);

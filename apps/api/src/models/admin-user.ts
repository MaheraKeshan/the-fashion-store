import { Schema, model } from 'mongoose';

const adminUserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin'], required: true, default: 'admin' },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'admin_users' },
);

export const AdminUser = model('AdminUser', adminUserSchema);

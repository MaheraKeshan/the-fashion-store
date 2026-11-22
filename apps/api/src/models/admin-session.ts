import { Schema, model } from 'mongoose';

const adminSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    csrfToken: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, collection: 'admin_sessions' },
);

export const AdminSession = model('AdminSession', adminSessionSchema);

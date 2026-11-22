import { Schema, model } from 'mongoose';

const adminAuditEventSchema = new Schema(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    action: {
      type: String,
      enum: [
        'admin.account.created',
        'admin.session.created',
        'admin.session.revoked',
        'delivery.settings.updated',
        'order.status.updated',
        'order.cancelled',
        'order.payment.updated',
      ],
      required: true,
    },
    resourceType: { type: String, required: true, trim: true },
    resourceId: { type: String, required: true, trim: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, collection: 'admin_audit_events' },
);

adminAuditEventSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

export const AdminAuditEvent = model('AdminAuditEvent', adminAuditEventSchema);

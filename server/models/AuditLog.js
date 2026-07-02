const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const auditLogSchema = new mongoose.Schema(
  {
    uuid: { type: String, default: uuidv4, unique: true },
    reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: {
      type: String,
      enum: [
        'created',
        'approved',
        'denied',
        'cancelled',
        'checked_in',
        'checked_out',
        'override',
        'extended',
        'extension_approved',
        'extension_denied',
      ],
      required: true,
    },
    details: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const extensionSchema = new mongoose.Schema({
  uuid: { type: String, default: uuidv4 },
  requestedEndTime: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
});

const reservationSchema = new mongoose.Schema(
  {
    bookingNumber: { type: String, unique: true },
    reservationCode: { type: String, unique: true },
    desk: { type: mongoose.Schema.Types.ObjectId, ref: 'Desk', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'denied', 'cancelled', 'checked_in', 'checked_out'],
      default: 'pending',
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    checkedInAt: { type: Date },
    checkedOutAt: { type: Date },
    isAdminOverride: { type: Boolean, default: false },
    overrideReason: { type: String },
    extensions: [extensionSchema],
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// Auto-generate booking number and reservation code before save
reservationSchema.pre('save', async function (next) {
  if (!this.bookingNumber) {
    const count = await mongoose.model('Reservation').countDocuments();
    this.bookingNumber = `BK-${String(count + 1).padStart(6, '0')}`;
  }
  if (!this.reservationCode) {
    this.reservationCode = uuidv4().split('-')[0].toUpperCase();
  }
  next();
});

reservationSchema.index({ desk: 1, date: 1, status: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);

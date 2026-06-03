const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    desk: { type: mongoose.Schema.Types.ObjectId, ref: 'Desk', required: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    status: {
      type: String,
      enum: ['confirmed', 'cancelled'],
      default: 'confirmed',
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// Prevent double-booking the same desk at the same date/time slot
reservationSchema.index({ desk: 1, date: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);

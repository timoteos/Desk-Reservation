const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    desk: { type: mongoose.Schema.Types.ObjectId, ref: 'Desk', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    startMin: { type: Number, required: true }, // minutes from midnight
    endMin: { type: Number, required: true },
    confirmationCode: { type: String, required: true, unique: true },
    recurring: {
      isRecurring: { type: Boolean, default: false },
      days: [{ type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri'] }],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reservation', reservationSchema);

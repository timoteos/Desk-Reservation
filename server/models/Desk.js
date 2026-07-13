const mongoose = require('mongoose');

const deskSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, unique: true },
    label: { type: String, required: true },
    location: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Desk', deskSchema);

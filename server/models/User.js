const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['employee', 'intern', 'supervisor', 'admin', 'it'],
      default: 'employee',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Role helpers
userSchema.virtual('isAdmin').get(function () {
  return ['admin', 'it'].includes(this.role);
});

module.exports = mongoose.model('User', userSchema);

const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/audit-logs
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.userId) filter.user = req.query.userId;
    if (req.query.reservationId) filter.reservation = req.query.reservationId;

    const logs = await AuditLog.find(filter)
      .populate('user', 'name email role')
      .populate('performedBy', 'name email role')
      .populate('reservation', 'bookingNumber reservationCode')
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 100);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const AuditLog = require('../models/AuditLog');
const { protect, adminOnly } = require('../middleware/auth');

const log = (action, reservation, performedBy, details, meta) =>
  AuditLog.create({ action, reservation: reservation._id, user: reservation.user, performedBy, details, meta });

// GET /api/reservations
router.get('/', protect, async (req, res) => {
  try {
    const filter = {};
    if (req.query.date) filter.date = new Date(req.query.date);
    if (req.query.status) filter.status = req.query.status;
    if (req.query.deskId) filter.desk = req.query.deskId;
    // Non-admins can only see their own
    if (!['admin', 'it'].includes(req.user.role)) filter.user = req.user._id;

    const reservations = await Reservation.find(filter)
      .populate('desk')
      .populate('user', 'name email role')
      .populate('approvedBy', 'name')
      .sort({ date: 1, startTime: 1 });
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reservations/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('desk')
      .populate('user', 'name email role')
      .populate('approvedBy', 'name');
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/reservations — create (pending approval)
router.post('/', protect, async (req, res) => {
  try {
    const { desk, date, startTime, endTime, notes } = req.body;

    const conflict = await Reservation.findOne({
      desk,
      date: new Date(date),
      status: { $in: ['approved', 'checked_in'] },
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    });
    if (conflict) return res.status(409).json({ message: 'Desk already reserved for this time slot' });

    const reservation = await Reservation.create({
      desk,
      user: req.user._id,
      date: new Date(date),
      startTime,
      endTime,
      notes,
    });

    await log('created', reservation, req.user._id, `Reservation created by ${req.user.name}`);
    res.status(201).json(await reservation.populate(['desk', { path: 'user', select: 'name email role' }]));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/reservations/:id/approve
router.put('/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', approvedBy: req.user._id, approvedAt: new Date() },
      { new: true }
    );
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    await log('approved', reservation, req.user._id, `Approved by ${req.user.name}`);
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/reservations/:id/deny
router.put('/:id/deny', protect, adminOnly, async (req, res) => {
  try {
    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { status: 'denied' },
      { new: true }
    );
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    await log('denied', reservation, req.user._id, req.body.reason || 'Denied by admin');
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/reservations/:id/cancel
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });

    const isOwner = reservation.user.toString() === req.user._id.toString();
    const isAdmin = ['admin', 'it'].includes(req.user.role);
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });

    reservation.status = 'cancelled';
    await reservation.save();
    await log('cancelled', reservation, req.user._id, `Cancelled by ${req.user.name}`);
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/reservations/:id/checkin
router.put('/:id/checkin', protect, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (reservation.status !== 'approved') return res.status(400).json({ message: 'Reservation must be approved before check-in' });

    reservation.status = 'checked_in';
    reservation.checkedInAt = new Date();
    await reservation.save();
    await log('checked_in', reservation, req.user._id, `Checked in at ${reservation.checkedInAt}`);
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/reservations/:id/checkout
router.put('/:id/checkout', protect, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (reservation.status !== 'checked_in') return res.status(400).json({ message: 'Must be checked in first' });

    reservation.status = 'checked_out';
    reservation.checkedOutAt = new Date();
    await reservation.save();
    await log('checked_out', reservation, req.user._id, `Checked out at ${reservation.checkedOutAt}`);
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/reservations/:id/extend — request time extension
router.post('/:id/extend', protect, async (req, res) => {
  try {
    const { requestedEndTime } = req.body;
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (reservation.status !== 'checked_in') return res.status(400).json({ message: 'Can only extend during active session' });

    // Check if requested slot is free
    const conflict = await Reservation.findOne({
      desk: reservation.desk,
      date: reservation.date,
      status: { $in: ['approved', 'checked_in'] },
      _id: { $ne: reservation._id },
      startTime: { $lt: requestedEndTime },
      endTime: { $gt: reservation.endTime },
    });

    // Auto-approve if no conflict, otherwise queue for admin
    const status = conflict ? 'pending' : 'approved';
    reservation.extensions.push({ requestedEndTime, status });

    if (status === 'approved') {
      reservation.endTime = requestedEndTime;
      await log('extended', reservation, req.user._id, `Extension auto-approved to ${requestedEndTime}`);
    } else {
      await log('extended', reservation, req.user._id, `Extension request pending admin approval`);
    }

    await reservation.save();
    res.json(reservation);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/reservations/:id/extensions/:extId/approve
router.put('/:id/extensions/:extId/approve', protect, adminOnly, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });

    const ext = reservation.extensions.id(req.params.extId);
    if (!ext) return res.status(404).json({ message: 'Extension not found' });

    ext.status = 'approved';
    ext.reviewedBy = req.user._id;
    ext.reviewedAt = new Date();
    reservation.endTime = ext.requestedEndTime;
    await reservation.save();
    await log('extension_approved', reservation, req.user._id, `Extension approved to ${ext.requestedEndTime}`);
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/reservations/:id/override — admin override
router.put('/:id/override', protect, adminOnly, async (req, res) => {
  try {
    const { startTime, endTime, date, reason } = req.body;
    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { startTime, endTime, date: date ? new Date(date) : undefined, isAdminOverride: true, overrideReason: reason, status: 'approved' },
      { new: true, omitUndefined: true }
    );
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    await log('override', reservation, req.user._id, reason || 'Admin override');
    res.json(reservation);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

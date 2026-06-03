const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');

// GET /api/reservations?date=YYYY-MM-DD&userId=xxx
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.date) filter.date = new Date(req.query.date);
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.deskId) filter.desk = req.query.deskId;

    const reservations = await Reservation.find(filter).populate('desk');
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reservations/:id
router.get('/:id', async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id).populate('desk');
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/reservations
router.post('/', async (req, res) => {
  try {
    const { desk, date, startTime, endTime } = req.body;

    // Check for conflicting reservations
    const conflict = await Reservation.findOne({
      desk,
      date: new Date(date),
      status: 'confirmed',
      $or: [
        { startTime: { $lt: endTime }, endTime: { $gt: startTime } },
      ],
    });

    if (conflict) {
      return res.status(409).json({ message: 'Desk is already reserved for this time slot' });
    }

    const reservation = new Reservation({ ...req.body, date: new Date(date) });
    const saved = await reservation.save();
    res.status(201).json(await saved.populate('desk'));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/reservations/:id/cancel
router.put('/:id/cancel', async (req, res) => {
  try {
    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/reservations/:id
router.delete('/:id', async (req, res) => {
  try {
    const reservation = await Reservation.findByIdAndDelete(req.params.id);
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    res.json({ message: 'Reservation deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

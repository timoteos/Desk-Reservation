const express = require('express');
const Reservation = require('../models/Reservation');

const router = express.Router();

// GET /api/reservations?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const filter = req.query.date ? { date: req.query.date } : {};
  const reservations = await Reservation.find(filter).populate('user desk');
  res.json(reservations);
});

// GET /api/reservations/code/:code
router.get('/code/:code', async (req, res) => {
  const reservation = await Reservation.findOne({ confirmationCode: req.params.code }).populate('user desk');
  if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
  res.json(reservation);
});

// POST /api/reservations
router.post('/', async (req, res) => {
  try {
    const reservation = await Reservation.create(req.body);
    res.status(201).json(reservation);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

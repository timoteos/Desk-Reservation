const express = require('express');
const Desk = require('../models/Desk');

const router = express.Router();

// GET /api/desks
router.get('/', async (req, res) => {
  const desks = await Desk.find().sort('number');
  res.json(desks);
});

// POST /api/desks
router.post('/', async (req, res) => {
  try {
    const desk = await Desk.create(req.body);
    res.status(201).json(desk);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

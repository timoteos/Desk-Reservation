const express = require('express');
const router = express.Router();
const Desk = require('../models/Desk');

// GET /api/desks
router.get('/', async (req, res) => {
  try {
    const desks = await Desk.find({ isActive: true });
    res.json(desks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/desks/:id
router.get('/:id', async (req, res) => {
  try {
    const desk = await Desk.findById(req.params.id);
    if (!desk) return res.status(404).json({ message: 'Desk not found' });
    res.json(desk);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/desks
router.post('/', async (req, res) => {
  try {
    const desk = new Desk(req.body);
    const saved = await desk.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/desks/:id
router.put('/:id', async (req, res) => {
  try {
    const desk = await Desk.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!desk) return res.status(404).json({ message: 'Desk not found' });
    res.json(desk);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/desks/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const desk = await Desk.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!desk) return res.status(404).json({ message: 'Desk not found' });
    res.json({ message: 'Desk deactivated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

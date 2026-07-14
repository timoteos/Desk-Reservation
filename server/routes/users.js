const express = require('express');
const User = require('../models/User');

const router = express.Router();

// GET /api/users
router.get('/', async (req, res) => {
  const users = await User.find().sort('name');
  res.json(users);
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

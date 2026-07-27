const express = require('express');
const { query } = require('../db');

const router = express.Router();

// GET /api/desks
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT desk_id, desk_number, is_active
         FROM desks
        WHERE is_active
        ORDER BY desk_number`
    );

    res.json(
      result.rows.map((row) => ({
        id: String(row.desk_id),
        number: row.desk_number,
        label: `Desk# ${row.desk_number}`,
      }))
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const { query } = require('../db');
const { rowToReservation } = require('../lib/reservationShape');

const router = express.Router();

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, r.role_type
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
        WHERE u.is_active
        ORDER BY u.first_name, u.last_name`
    );

    res.json(
      result.rows.map((row) => ({
        id: String(row.user_id),
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        role: row.role_type,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id/reservations — upcoming bookings, for the admin dashboard
router.get('/:id/reservations', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.reservation_id, r.user_id, r.desk_id, r.starts_at, r.ends_at,
              r.status, r.confirmation_code,
              u.first_name, u.last_name, d.desk_number
         FROM reservations r
         JOIN users u ON u.user_id = r.user_id
         JOIN desks d ON d.desk_id = r.desk_id
        WHERE r.user_id = $1
          AND r.starts_at >= current_date
          AND r.status IN ('pending', 'approved')
        ORDER BY r.starts_at`,
      [req.params.id]
    );

    res.json(result.rows.map(rowToReservation));
  } catch (err) {
    next(err);
  }
});

module.exports = router;

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

// GET /api/users/:id/reservations — upcoming confirmed bookings.
//
// Approved only: a pending request isn't a reservation yet, and listing it here
// would tell an admin someone holds a desk they haven't been granted.
router.get('/:id/reservations', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.reservation_id, r.user_id, r.desk_id, r.starts_at, r.ends_at,
              r.status, r.confirmation_code, r.decided_at,
              u.first_name, u.last_name, d.desk_number,
              a.first_name AS approver_first_name,
              a.last_name  AS approver_last_name
         FROM reservations r
         JOIN users u ON u.user_id = r.user_id
         JOIN desks d ON d.desk_id = r.desk_id
         LEFT JOIN users a ON a.user_id = r.decided_by_user_id
        WHERE r.user_id = $1
          AND r.starts_at >= current_date
          AND r.status = 'approved'
        ORDER BY r.starts_at`,
      [req.params.id]
    );

    res.json(
      result.rows.map((row) => ({
        ...rowToReservation(row),
        approvedBy: row.approver_first_name
          ? `${row.approver_first_name} ${row.approver_last_name}`
          : null,
        approvedAt: row.decided_at,
      }))
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;

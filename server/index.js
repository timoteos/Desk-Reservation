require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { expirePending } = require('./lib/expirePending');

const usersRouter = require('./routes/users');
const desksRouter = require('./routes/desks');
const reservationsRouter = require('./routes/reservations');
const recurringSchedulesRouter = require('./routes/recurringSchedules');
const requestsRouter = require('./routes/requests');
const authRouter = require('./routes/auth');
const { readToken } = require('./lib/auth');

const app = express();
const PORT = process.env.SERVER_PORT || 5000;

app.use(cors());
app.use(express.json());
// Populates req.user when a valid token is present; routes decide if they need one.
app.use(readToken);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/desks', desksRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/recurring-schedules', recurringSchedulesRouter);
app.use('/api/requests', requestsRouter);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

// Anything a route passes to next() lands here.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

pool
  .query('SELECT 1')
  .then(() => {
    console.log('Connected to PostgreSQL');
    // Clear anything that lapsed while the server was down.
    return expirePending().then(() => {
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });

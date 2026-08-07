require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { expirePending } = require('./lib/expirePending');

const usersRouter = require('./routes/users');
const desksRouter = require('./routes/desks');
const reservationsRouter = require('./routes/reservations');
const recurringSchedulesRouter = require('./routes/recurringSchedules');
const requestsRouter = require('./routes/requests');
const schedulesRouter = require('./routes/schedules');
const logsRouter = require('./routes/logs');
const authRouter = require('./routes/auth');
const { readToken } = require('./lib/auth');

const app = express();

// PORT is what every host injects — Render, Railway, Fly, Heroku all set it and
// then health-check the port they chose. Reading only SERVER_PORT meant binding
// 5000 regardless, so a deploy would report success while nothing could reach
// the API. SERVER_PORT stays first so local .env files keep working.
const PORT = process.env.SERVER_PORT || process.env.PORT || 5000;

// Wide-open CORS is right for a laptop and wrong once this is reachable: the
// booking and lookup endpoints are deliberately public, so without an allowlist
// any site could drive them from a visitor's browser. Comma-separated origins,
// and with none set it stays open so local development is unchanged.
// Trailing slashes stripped, because an Origin header never carries one and
// this is exact string matching — so `https://example.com/` in the host's
// dashboard silently allows nothing, and the symptom is a CORS failure that
// looks like the allowlist was never set. The same character already cost an
// evening on REACT_APP_API_URL; it is not worth a second one.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(cors(
  allowedOrigins.length === 0 ? undefined : {
    origin(origin, callback) {
      // No Origin header means curl, a health check, or a same-origin request.
      // A disallowed one is answered without the headers rather than with an
      // error: the browser is what enforces CORS, and raising here would turn
      // somebody else's page into a 500 and a stack trace in our logs — which
      // anyone could then generate at will.
      callback(null, !origin || allowedOrigins.includes(origin));
    },
  }
));
app.use(express.json());
// Populates req.user when a valid token is present; routes decide if they need one.
app.use(readToken);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/desks', desksRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/recurring-schedules', recurringSchedulesRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/logs', logsRouter);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

// Serve the built frontend from the API itself, so both halves are one origin.
// That is the whole reason to host this way: same origin means no CORS
// allowlist to maintain, and a session cookie is first-party rather than the
// third-party kind browsers are steadily switching off.
//
// Conditional, because there is no build/ on a laptop — the CRA dev server on
// :3000 is the frontend there, and this block staying inert keeps that
// unchanged. It also means a deploy that forgot to build serves 404s from the
// API rather than a stale page.
const BUILD_DIR = path.join(__dirname, '..', 'build');

if (fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
  app.use(express.static(BUILD_DIR));

  // The SPA fallback: React Router owns /calendar and /admin, but a person who
  // types one, or refreshes it, asks the server for it first.
  //
  // The pattern is a regex because this is Express 5, where `app.get('*')`
  // does not mean "everything" — path-to-regexp v8 dropped bare wildcards and
  // throws at startup instead. The server would refuse to boot, at the point
  // where the message names a routing library nobody here installed directly.
  //
  // Registered after the API routes, and still checking the prefix: without
  // that, a misspelled endpoint would hand back index.html with a 200, and the
  // client would report a JSON parse error rather than the 404 it deserved.
  //
  // /static/ is excluded for the same reason. Those filenames carry a content
  // hash, so a request for one that is missing means a stale page is asking for
  // a chunk the current build no longer has. Falling back would answer with
  // HTML and a 200, and the browser would fail on `Unexpected token '<'` —
  // which says nothing about the deploy that caused it. A 404 does.
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/static/')) return next();
    res.sendFile(path.join(BUILD_DIR, 'index.html'));
  });
}

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

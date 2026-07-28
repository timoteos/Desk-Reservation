const express = require('express');
const { verifyCredentials, issueToken } = require('../lib/auth');

const router = express.Router();

// POST /api/auth/login   { email, password }
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await verifyCredentials(email, password);

    // One message for every failure. Distinguishing "no such account" from
    // "wrong password" would let someone enumerate valid addresses.
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    res.json({
      token: issueToken(user),
      user: {
        id: String(user.user_id),
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role_type,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — lets the frontend confirm a stored token is still valid
// rather than discovering it expired on the next action.
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not signed in.' });
  }
  res.json({ id: String(req.user.sub), email: req.user.email, role: req.user.role });
});

module.exports = router;

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const TOKEN_TTL = '8h'; // A workday. Long enough not to annoy, short enough to matter.
const BCRYPT_ROUNDS = 12;

// Refuse to run rather than fall back to a default secret: a predictable
// signing key means anyone can mint a valid admin token.
function signingSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set — refusing to sign tokens with a default.');
  }
  return secret;
}

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);

const issueToken = (user) =>
  jwt.sign(
    { sub: user.user_id, email: user.email, role: user.role_type },
    signingSecret(),
    { expiresIn: TOKEN_TTL }
  );

// Verifies email + password. Returns null for every failure mode — unknown
// address, no password set, wrong password, deactivated account — so the
// response can't be used to discover which addresses exist.
async function verifyCredentials(email, password) {
  if (!email || !password) return null;

  const { rows } = await query(
    `SELECT u.user_id, u.email, u.first_name, u.last_name, u.password_hash, r.role_type
       FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE lower(u.email) = lower($1) AND u.is_active`,
    [email.trim()]
  );

  const user = rows[0];
  if (!user || !user.password_hash) return null;

  const matches = await bcrypt.compare(password, user.password_hash);
  return matches ? user : null;
}

// Populates req.user from the Authorization header when a valid token is
// present. Does not reject — routes decide whether they require one.
function readToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try {
      req.user = jwt.verify(token, signingSecret());
    } catch {
      // Expired or tampered — treated the same as no token at all.
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Sign in to continue.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'That action requires an administrator account.' });
  }
  next();
}

module.exports = { hashPassword, verifyCredentials, issueToken, readToken, requireAdmin };

// ===========================================================================
// routes/auth.js — accounts & login.
// ===========================================================================
// Endpoints:
//   POST   /api/register  -> create an account (and log in)
//   POST   /api/login     -> log in to an existing account
//   POST   /api/logout    -> log out
//   GET    /api/me        -> who is logged in right now?
//
// Security notes we teach here:
//   * Passwords are hashed with bcrypt — we never store the plain password.
//   * Every query is PARAMETERIZED ($1, $2 ...) so user input can't be run as
//     SQL. This is our default defense against SQL injection.
// ===========================================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

// How many bcrypt "rounds" to use. Higher = slower = harder to brute-force.
// 10 is a common, sensible default.
const SALT_ROUNDS = 10;

// Small helper so login + register store identity the same way.
function startSession(req, user) {
  req.session.userId = user.id;
  req.session.username = user.username;
}

// ---------------------------------------------------------------------------
// POST /api/register  — create a new account, then log them in.
// ---------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    // --- validate input ---
    if (username.length < 3 || username.length > 20) {
      return res
        .status(400)
        .json({ error: 'Username must be 3–20 characters.' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res
        .status(400)
        .json({ error: 'Username can only use letters, numbers, and _.' });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters.' });
    }

    // Hash the password before it ever touches the database.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert the new user. The UNIQUE constraint on username (in schema.sql)
    // protects us if two people pick the same name at the same time.
    const result = await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, created_at`,
      [username, passwordHash]
    );

    const user = result.rows[0];
    startSession(req, user); // log them in immediately
    return res.status(201).json(user);
  } catch (err) {
    // Postgres error code 23505 = "unique_violation" => username already taken.
    if (err.code === '23505') {
      return res.status(400).json({ error: 'That username is already taken.' });
    }
    console.error('register error:', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/login  — verify a password and start a session.
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: 'Username and password are required.' });
    }

    const result = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];

    // IMPORTANT: give the SAME error whether the username is wrong or the
    // password is wrong. That way an attacker can't tell which usernames exist.
    const passwordOk =
      user && (await bcrypt.compare(password, user.password_hash));
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    startSession(req, user);
    return res.json({ id: user.id, username: user.username });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/logout  — end the session.
// ---------------------------------------------------------------------------
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid'); // remove the session cookie in the browser
    res.status(204).end();          // 204 = success, no content to return
  });
});

// ---------------------------------------------------------------------------
// GET /api/me  — the frontend calls this on load to learn who's logged in.
// ---------------------------------------------------------------------------
router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  const result = await pool.query(
    'SELECT id, username, created_at FROM users WHERE id = $1',
    [req.session.userId]
  );
  if (result.rows.length === 0) {
    // The session points to a user that no longer exists; clear it.
    return req.session.destroy(() =>
      res.status(401).json({ error: 'Not logged in.' })
    );
  }
  return res.json(result.rows[0]);
});

module.exports = router;

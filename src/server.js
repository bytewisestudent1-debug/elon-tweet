// ===========================================================================
// server.js — the Express application + server startup.
// ===========================================================================
// This file ties everything together:
//   1. loads environment variables
//   2. sets up middleware (JSON parsing, login sessions)
//   3. mounts the API routes
//   4. serves the frontend in /public as static files
//   5. starts listening
// Because it serves both the API and the frontend, the WHOLE app runs from
// this one server — easy to run locally and easy to deploy to Render.
// ===========================================================================

// Load variables from a local .env file into process.env (no-op if absent).
// Must run BEFORE we read any process.env value below.
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

// Our route modules (built in the other files).
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ------------------------------------------------------------

// Parse incoming JSON request bodies into req.body.
app.use(express.json());

// Render (and most hosts) put your app behind a proxy. Trusting it lets the
// "secure" session cookie work correctly over HTTPS in production.
app.set('trust proxy', 1);

// Login sessions: after a successful login we store the user's id in the
// session, and express-session sends the browser a signed cookie that
// identifies that session on later requests.
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    resave: false,            // don't re-save unchanged sessions
    saveUninitialized: false, // don't create empty sessions for logged-out users
    cookie: {
      httpOnly: true,         // JavaScript in the browser can't read the cookie
      sameSite: 'lax',        // basic CSRF protection
      secure: process.env.NODE_ENV === 'production', // HTTPS-only in production
      maxAge: 1000 * 60 * 60 * 24 * 7, // stay logged in for 1 week
    },
  })
);

// --- API routes ------------------------------------------------------------
// Each module handles a group of related endpoints. The first argument is the
// URL prefix the routes are mounted under.
app.use('/api', authRoutes);        // /api/register, /api/login, /api/logout, /api/me
app.use('/api/posts', postRoutes);  // /api/posts ... feed, create, delete, like
app.use('/api/users', userRoutes);  // /api/users/:username ... profiles

// --- Frontend --------------------------------------------------------------
// Serve everything in /public (index.html, style.css, app.js) as static files.
// Visiting "/" returns public/index.html automatically.
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Start -----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Elon Tweet is running at http://localhost:${PORT}`);
});

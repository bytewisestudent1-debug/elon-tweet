// ===========================================================================
// middleware.js — small reusable pieces that run before a route handler.
// ===========================================================================

// requireLogin protects routes that should only work for a logged-in user.
// When a user logs in, we save their id on req.session.userId (see auth.js).
// If that's missing, the request is rejected with 401 Unauthorized and the
// real route handler never runs.
function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in to do that.' });
  }
  next(); // logged in — continue to the actual route
}

module.exports = { requireLogin };

// ===========================================================================
// routes/users.js — public user profiles.
// ===========================================================================
// Endpoint (mounted under /api/users in server.js):
//   GET /api/users/:username  -> a user's profile + all of their tweets
//
// A profile is public, so this route does NOT require login. But we still pass
// the current user's id into the query so the heart buttons reflect what the
// logged-in viewer has liked.
// ===========================================================================

const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/users/:username
router.get('/:username', async (req, res) => {
  try {
    const me = req.session.userId || 0; // 0 = "no user" (see posts.js feed)

    // 1) Find the user by name.
    const userResult = await pool.query(
      'SELECT id, username, created_at FROM users WHERE username = $1',
      [req.params.username]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userResult.rows[0];

    // 2) Fetch that user's posts (newest first) in the same shape as the feed.
    const postsResult = await pool.query(
      `SELECT
         posts.id,
         posts.content,
         posts.created_at,
         users.username,
         COUNT(likes.id)::int AS like_count,
         COALESCE(BOOL_OR(likes.user_id = $2), false) AS liked_by_me
       FROM posts
       JOIN users ON users.id = posts.user_id
       LEFT JOIN likes ON likes.post_id = posts.id
       WHERE posts.user_id = $1
       GROUP BY posts.id, users.username
       ORDER BY posts.created_at DESC`,
      [user.id, me]
    );

    return res.json({ user, posts: postsResult.rows });
  } catch (err) {
    console.error('profile error:', err);
    return res.status(500).json({ error: 'Could not load the profile.' });
  }
});

module.exports = router;

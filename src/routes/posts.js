// ===========================================================================
// routes/posts.js — tweets and likes.
// ===========================================================================
// Endpoints (all mounted under /api/posts in server.js):
//   GET    /api/posts            -> the feed: every tweet, newest first
//   POST   /api/posts            -> create a tweet (must be logged in)
//   DELETE /api/posts/:id        -> delete YOUR tweet
//   POST   /api/posts/:id/like   -> like a tweet
//   DELETE /api/posts/:id/like   -> unlike a tweet
//
// Reminder: every query is parameterized ($1, $2 ...) for SQL-injection safety.
// ===========================================================================

const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware');

const router = express.Router();

const MAX_LENGTH = 280; // matches the CHECK constraint in schema.sql

// Helper: parse ":id" from the URL and make sure it's a positive whole number.
// Returns the number, or null if it isn't a valid id.
function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// GET /api/posts  — the feed.
// ---------------------------------------------------------------------------
// For each post we also compute:
//   username    -> the author's name (JOIN to users)
//   like_count  -> how many likes it has (LEFT JOIN + COUNT)
//   liked_by_me -> whether the CURRENT user has liked it (so the heart fills in)
router.get('/', async (req, res) => {
  try {
    // 0 is a safe "no user" id: it never matches a real users.id, so a
    // logged-out visitor simply gets liked_by_me = false everywhere.
    const me = req.session.userId || 0;

    const result = await pool.query(
      `SELECT
         posts.id,
         posts.content,
         posts.created_at,
         users.username,
         COUNT(likes.id)::int AS like_count,
         COALESCE(BOOL_OR(likes.user_id = $1), false) AS liked_by_me
       FROM posts
       JOIN users ON users.id = posts.user_id
       LEFT JOIN likes ON likes.post_id = posts.id
       GROUP BY posts.id, users.username
       ORDER BY posts.created_at DESC`,
      [me]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('feed error:', err);
    return res.status(500).json({ error: 'Could not load the feed.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts  — create a tweet. Author is the logged-in user.
// ---------------------------------------------------------------------------
router.post('/', requireLogin, async (req, res) => {
  try {
    // Coerce to string, trim whitespace, then validate.
    const content = (typeof req.body.content === 'string' ? req.body.content : '').trim();

    if (content.length === 0) {
      return res.status(400).json({ error: 'Tweet cannot be empty.' });
    }
    if (content.length > MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `Tweet must be ${MAX_LENGTH} characters or fewer.` });
    }

    const result = await pool.query(
      `INSERT INTO posts (user_id, content)
       VALUES ($1, $2)
       RETURNING id, content, created_at`,
      [req.session.userId, content]
    );

    // Return the new post in the SAME shape the feed uses, so the frontend can
    // drop it straight into the list. A brand-new post has 0 likes.
    const post = result.rows[0];
    return res.status(201).json({
      ...post,
      username: req.session.username,
      like_count: 0,
      liked_by_me: false,
    });
  } catch (err) {
    console.error('create post error:', err);
    return res.status(500).json({ error: 'Could not save your tweet.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/posts/:id  — delete a tweet you own.
// ---------------------------------------------------------------------------
router.delete('/:id', requireLogin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid post id.' });
    }

    // Look up the post first so we can give precise status codes:
    //   not found      -> 404
    //   someone else's -> 403
    const found = await pool.query('SELECT user_id FROM posts WHERE id = $1', [id]);
    if (found.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    if (found.rows[0].user_id !== req.session.userId) {
      return res.status(403).json({ error: 'You can only delete your own posts.' });
    }

    await pool.query('DELETE FROM posts WHERE id = $1', [id]);
    return res.status(204).end(); // 204 = success, nothing to return
  } catch (err) {
    console.error('delete post error:', err);
    return res.status(500).json({ error: 'Could not delete the tweet.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts/:id/like  — like a tweet.
// ---------------------------------------------------------------------------
router.post('/:id/like', requireLogin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid post id.' });
    }

    // Make sure the post exists before we like it.
    const post = await pool.query('SELECT id FROM posts WHERE id = $1', [id]);
    if (post.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    // Insert the like. ON CONFLICT DO NOTHING relies on the UNIQUE(user_id,
    // post_id) constraint: liking twice is harmless and won't error.
    await pool.query(
      `INSERT INTO likes (user_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, post_id) DO NOTHING`,
      [req.session.userId, id]
    );

    const count = await pool.query(
      'SELECT COUNT(*)::int AS like_count FROM likes WHERE post_id = $1',
      [id]
    );
    return res.status(201).json({ like_count: count.rows[0].like_count, liked_by_me: true });
  } catch (err) {
    console.error('like error:', err);
    return res.status(500).json({ error: 'Could not like the tweet.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/posts/:id/like  — unlike a tweet.
// ---------------------------------------------------------------------------
router.delete('/:id/like', requireLogin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid post id.' });
    }

    // Deleting a like that isn't there is fine — the result is the same:
    // this user no longer likes this post.
    await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [
      req.session.userId,
      id,
    ]);

    const count = await pool.query(
      'SELECT COUNT(*)::int AS like_count FROM likes WHERE post_id = $1',
      [id]
    );
    return res.json({ like_count: count.rows[0].like_count, liked_by_me: false });
  } catch (err) {
    console.error('unlike error:', err);
    return res.status(500).json({ error: 'Could not unlike the tweet.' });
  }
});

module.exports = router;

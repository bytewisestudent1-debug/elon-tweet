-- ===========================================================================
-- Elon Tweet — database schema
-- ===========================================================================
-- Run this file ONCE against your Postgres database to create the tables.
--
--   Local:   psql "postgres://localhost:5432/elon_tweet" -f schema.sql
--   Render:  psql "<your DATABASE_URL>" -f schema.sql
--
-- We use "IF NOT EXISTS" everywhere so running this twice won't crash —
-- handy when students re-run it while experimenting.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- users: one row per account.
-- ---------------------------------------------------------------------------
-- We store a *bcrypt hash* of the password, never the password itself.
-- If our database ever leaked, the real passwords would still be protected.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,             -- auto-incrementing unique id
  username      TEXT        NOT NULL UNIQUE,    -- UNIQUE => no two users share a name
  password_hash TEXT        NOT NULL,           -- bcrypt hash (see routes/auth.js)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()  -- "joined" date, set automatically
);


-- ---------------------------------------------------------------------------
-- posts: one row per tweet.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id         SERIAL PRIMARY KEY,
  -- user_id links a post to its author. REFERENCES enforces that the author
  -- actually exists. ON DELETE CASCADE => if a user is deleted, their posts go too.
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The CHECK is a *second line of defense*: even if our app code had a bug,
  -- the database itself refuses empty or too-long tweets (1..280 characters).
  content    TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- likes: one row per (user likes post).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS likes (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  -- The UNIQUE pair means a user can like a given post at most once.
  -- This is what makes "like / unlike" safe and simple in the code.
  UNIQUE (user_id, post_id)
);


-- ---------------------------------------------------------------------------
-- Indexes — make common lookups fast.
-- ---------------------------------------------------------------------------
-- The feed sorts by newest-first, so index created_at descending.
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
-- Profile pages fetch "all posts by one user", so index user_id.
CREATE INDEX IF NOT EXISTS idx_posts_user_id    ON posts (user_id);


-- ===========================================================================
-- Seed data — a few demo accounts and tweets so the feed isn't empty on first
-- run. This whole section is OPTIONAL and safe to re-run (it won't duplicate).
-- ===========================================================================
-- All three demo accounts share the same login password:  password123
-- The string below is a real *bcrypt hash* of that password, so you can log in
-- as ada / grace / linus to try the app immediately.
-- (Generated with: bcryptjs.hashSync('password123', 10) — verified valid.)

-- 1) Demo users. ON CONFLICT DO NOTHING => running this twice is harmless.
INSERT INTO users (username, password_hash) VALUES
  ('ada',   '$2a$10$bsC1Nsg1Afjn9EWW/y.DzOMXUFTMh6XQzcw0iUj09T5yW8eZPzHbi'),
  ('grace', '$2a$10$bsC1Nsg1Afjn9EWW/y.DzOMXUFTMh6XQzcw0iUj09T5yW8eZPzHbi'),
  ('linus', '$2a$10$bsC1Nsg1Afjn9EWW/y.DzOMXUFTMh6XQzcw0iUj09T5yW8eZPzHbi')
ON CONFLICT (username) DO NOTHING;

-- 2) Demo tweets. We look up each author's id by username (so we don't depend
--    on specific id numbers), and stagger created_at so the feed has a natural
--    newest-first order. The WHERE NOT EXISTS guard means we only seed posts
--    when the posts table is still empty — re-running won't pile on duplicates.
INSERT INTO posts (user_id, content, created_at)
SELECT u.id, v.content, now() - (v.mins || ' minutes')::interval
FROM (VALUES
  ('ada',   'Wrote my first loop today. It looped. 🎉',                       5),
  ('grace', 'Found a literal bug in the machine. Taped it into the logbook.', 30),
  ('linus', 'Talk is cheap. Show me the code.',                              90),
  ('ada',   'Counting from zero still trips me up sometimes.',              150),
  ('grace', 'A ship in port is safe — but that is not what ships are for.',  300)
) AS v(username, content, mins)
JOIN users u ON u.username = v.username
WHERE NOT EXISTS (SELECT 1 FROM posts);

-- 3) A few demo likes so the like counts aren't all zero. ON CONFLICT DO
--    NOTHING respects the UNIQUE(user_id, post_id) rule on re-runs.
INSERT INTO likes (user_id, post_id)
SELECT u.id, p.id
FROM posts p
JOIN users u ON (
  (p.content LIKE 'Talk is cheap%'       AND u.username IN ('ada', 'grace')) OR
  (p.content LIKE 'Found a literal bug%' AND u.username IN ('ada', 'linus')) OR
  (p.content LIKE 'Wrote my first loop%' AND u.username = 'grace')
)
ON CONFLICT (user_id, post_id) DO NOTHING;

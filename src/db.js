// ===========================================================================
// db.js — ONE shared Postgres connection pool for the whole app.
// ===========================================================================
// A "pool" keeps a small set of database connections open and hands them out
// as queries come in. We create it once here and import it everywhere, so the
// whole app shares the same pool instead of opening a new connection per query.
// ===========================================================================

const { Pool } = require('pg');

// Read the connection string from the environment, with a sensible local
// default so the app can start on a fresh machine without extra setup.
const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/elon_tweet';

const pool = new Pool({
  connectionString,

  // Managed Postgres providers like Render require an SSL connection, but a
  // local Postgres usually does NOT. We turn SSL on only in production.
  // rejectUnauthorized:false accepts Render's certificate without extra config.
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

// If a pooled connection ever errors out in the background, log it instead of
// letting it crash the whole server.
pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err);
});

// Export the pool so route files can do:  pool.query('SELECT ...', [params])
module.exports = pool;

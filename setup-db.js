// ===========================================================================
// setup-db.js — create the database (if needed) and load schema.sql.
// ===========================================================================
// This does the same job as the two `psql` commands, but using the `pg`
// library that's already installed — so you DON'T need the psql command-line
// tool on your PATH. Run it with:   npm run setup
// ===========================================================================

require('dotenv').config(); // load DATABASE_URL from .env
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/elon_tweet';

// Use SSL only in production (e.g. on Render). Local Postgres — including the
// one in docker-compose — does not speak SSL, so we keep it off there. This
// mirrors the exact same rule in src/db.js so both behave identically.
function sslConfig() {
  return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

// Safely quote a database name for use in a CREATE DATABASE statement
// (you can't pass identifiers as $1 parameters).
function quoteIdent(name) {
  return '"' + name.replace(/"/g, '""') + '"';
}

async function main() {
  const target = new URL(DATABASE_URL);
  const dbName = target.pathname.replace(/^\//, '') || 'elon_tweet';

  // --- Step 1: make sure the database exists -------------------------------
  // We connect to the always-present "postgres" maintenance database and try
  // to CREATE our app database. If it already exists (or we lack permission,
  // common on hosted providers where the DB is pre-made), we just continue.
  const adminUrl = new URL(DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new Client({
    connectionString: adminUrl.toString(),
    ssl: sslConfig(),
  });
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
    console.log(`Created database "${dbName}".`);
  } catch (err) {
    if (err.code === '42P04') {
      console.log(`Database "${dbName}" already exists — continuing.`);
    } else {
      console.log(`Skipping create step (${err.message}). Trying to load schema anyway.`);
    }
  } finally {
    await admin.end().catch(() => {});
  }

  // --- Step 2: load schema.sql into the app database -----------------------
  // schema.sql has no bound parameters, so we can run the whole file at once.
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = new Client({ connectionString: DATABASE_URL, ssl: sslConfig() });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log(`Loaded schema.sql into "${dbName}". Setup complete. ✅`);
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  console.error('Is your database running and does DATABASE_URL in .env point to it?');
  process.exit(1);
});

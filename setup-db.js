// ===========================================================================
// setup-db.js — create the database (if needed) and load schema.sql.
// ===========================================================================
// Runs once when the container starts (see "start:docker" in package.json).
// It uses the `pg` library, so no `psql` command-line tool is required.
//
// Reads the connection string from the DATABASE_URL environment variable.
//   * Locally (docker-compose) that points at the "db" service.
//   * On Render, you set it to your Postgres "Internal Database URL".
// ===========================================================================

require('dotenv').config(); // loads DATABASE_URL from .env when running locally
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/elon_tweet';

// Use SSL only in production (e.g. Render). Local Postgres doesn't speak SSL.
// Mirrors the same rule in src/db.js.
function sslConfig() {
  return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

// Safely quote a database name for CREATE DATABASE (can't be a $1 parameter).
function quoteIdent(name) {
  return '"' + name.replace(/"/g, '""') + '"';
}

// Print the URL for logs WITHOUT leaking the password.
function maskUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '(could not parse DATABASE_URL)';
  }
}

// Connect a client, retrying a few times — on first deploy the database may
// take a moment to become reachable.
async function connectWithRetry(makeClient, label, attempts) {
  for (let i = 1; i <= attempts; i++) {
    const client = makeClient();
    try {
      await client.connect();
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      console.log(`  ${label}: attempt ${i}/${attempts} failed — ${err.code || ''} ${err.message || '(no message)'}`);
      if (i === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function main() {
  const target = new URL(DATABASE_URL);
  const dbName = target.pathname.replace(/^\//, '') || 'elon_tweet';

  console.log(`Setting up database "${dbName}"`);
  console.log(`  using: ${maskUrl(DATABASE_URL)}`);
  console.log(`  SSL:   ${process.env.NODE_ENV === 'production' ? 'on (production)' : 'off'}`);

  // --- Step 1: best-effort create the database -----------------------------
  // Many hosts (including Render) pre-create the database and don't let you
  // connect to the "postgres" maintenance DB. That's fine — we just skip this.
  try {
    const adminUrl = new URL(DATABASE_URL);
    adminUrl.pathname = '/postgres';
    const admin = await connectWithRetry(
      () => new Client({ connectionString: adminUrl.toString(), ssl: sslConfig() }),
      'create-step',
      2
    );
    try {
      await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
      console.log(`  created database "${dbName}".`);
    } catch (err) {
      if (err.code === '42P04') console.log(`  database "${dbName}" already exists — continuing.`);
      else console.log(`  create step skipped (${err.code || ''}) — continuing.`);
    } finally {
      await admin.end().catch(() => {});
    }
  } catch {
    console.log('  create step skipped (no access to maintenance db) — continuing.');
  }

  // --- Step 2: load schema.sql into the target database (must succeed) ------
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await connectWithRetry(
    () => new Client({ connectionString: DATABASE_URL, ssl: sslConfig() }),
    'load-schema',
    6
  );
  await client.query(sql);
  await client.end();
  console.log(`Loaded schema.sql into "${dbName}". Setup complete. ✅`);
}

main().catch((err) => {
  console.error('\nSetup FAILED.');
  console.error('  error code:    ', err.code || '(none)');
  console.error('  error message: ', err.message || '(empty)');
  console.error('\nThis almost always means DATABASE_URL is missing or wrong.');
  console.error('On Render: open your Web Service > Environment and confirm:');
  console.error('  - DATABASE_URL is set to your Postgres "Internal Database URL"');
  console.error('  - NODE_ENV is set to "production"');
  console.error('  - the database and web service are in the SAME region');
  process.exit(1);
});

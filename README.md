# 🐦 Elon Tweet

A minimal Twitter clone built for a class project. The goal is **clarity over
cleverness**: plain HTML/CSS/JavaScript on the front end, Node.js + Express on
the back end, and PostgreSQL for storage. Every file is commented for beginners.

## Features
- Create an account, log in, and log out (passwords are hashed with bcrypt).
- Post a tweet (1–280 characters).
- See a feed of all tweets, newest first, with author and like count.
- Like / unlike any tweet.
- Visit a user's profile to see just their tweets.

## Tech stack
| Layer     | Choice                                  |
|-----------|-----------------------------------------|
| Frontend  | Plain HTML, CSS, vanilla JS (no framework) |
| Backend   | Node.js + Express                       |
| Database  | PostgreSQL (via the `pg` library)       |
| Auth      | `express-session` + `bcryptjs`          |

## Project layout
```
public/            Frontend (served as static files by Express)
  index.html       Page skeleton
  style.css        Hand-written CSS, no framework
  app.js           UI logic — fake data first, then real fetch() calls
src/
  server.js        Express app + server start
  db.js            One shared Postgres connection pool
  middleware.js    requireLogin guard for protected routes
  routes/
    auth.js        /api/register, /api/login, /api/logout, /api/me
    posts.js       /api/posts feed, create, delete, like/unlike
    users.js       /api/users/:username profile
schema.sql         Table definitions (users, posts, likes)
.env.example       Example environment variables
package.json       Dependencies + "start" script
```

---

## Run it locally with Docker (easiest)

If you have **Docker Desktop**, you don't need to install Node or PostgreSQL —
Docker runs both for you. From the project folder:

```bash
docker compose up --build
```

This builds the app image, starts PostgreSQL, **auto-loads `schema.sql`**
(including the demo accounts and tweets), and starts the server. When it's up,
open **http://localhost:3000** and log in as `ada` / `password123`.

Handy commands:
```bash
docker compose up --build       # start everything (Ctrl+C to stop)
docker compose up -d --build    # start in the background
docker compose down             # stop & remove containers (KEEPS your data)
docker compose down -v          # stop AND wipe the database (re-seeds next time)
docker compose logs -f app      # follow the server logs
```

> Your tweets live in a Docker volume (`db-data`) and survive `docker compose
> down`. Use `down -v` only when you want a fresh, re-seeded database.

---

## Run it locally without Docker (manual)

Prefer to run things directly? You need **Node.js 18+** and **PostgreSQL** installed.

### 1. Install dependencies
```bash
npm install
```

### 2. Create a database
```bash
# create an empty database named "elon_tweet"
createdb elon_tweet
```
> On Windows, you can also create the database from the **SQL Shell (psql)** app
> with:  `CREATE DATABASE elon_tweet;`

### 3. Load the schema (creates the tables) — run this ONCE
```bash
psql "postgres://postgres:postgres@localhost:5432/elon_tweet" -f schema.sql
```
> Adjust the username/password in that URL to match your local Postgres.

### 4. Set up environment variables
```bash
cp .env.example .env      # macOS/Linux
copy .env.example .env    # Windows
```
Then open `.env` and make sure `DATABASE_URL` matches your local Postgres, and
set `SESSION_SECRET` to any long random string.

### 5. Start the server
```bash
npm start
```
Open **http://localhost:3000** in your browser. Create an account and tweet!

### Demo accounts (from the seed data)
`schema.sql` seeds three users and some tweets so the feed isn't empty. You can
log in as any of them — the password for all three is **`password123`**:

| Username | Password      |
|----------|---------------|
| `ada`    | `password123` |
| `grace`  | `password123` |
| `linus`  | `password123` |

> The seed section only adds tweets when the table is empty and uses
> `ON CONFLICT DO NOTHING`, so re-running `schema.sql` won't create duplicates.

---

## Teaching tip: fake data ➜ real data

Open `public/app.js` and find this line near the top:

```js
const USE_FAKE_DATA = false;
```

- Set it to **`true`** and the entire UI runs from a hardcoded array in the
  browser — **no server or database required**. Great for showing the interface
  before any backend exists.
- Set it back to **`false`** and the exact same UI talks to the live Express +
  Postgres backend. The `Data` object in `app.js` is the single switch point.

---

## API reference

All endpoints return JSON. Routes marked 🔒 require being logged in.

| Method | Path                     | Purpose                              | Success | Errors            |
|--------|--------------------------|--------------------------------------|---------|-------------------|
| POST   | `/api/register`          | Create an account (and log in)       | 201     | 400               |
| POST   | `/api/login`             | Log in                               | 200     | 400, 401          |
| POST   | `/api/logout`            | Log out                              | 204     | —                 |
| GET    | `/api/me`                | Current logged-in user               | 200     | 401               |
| GET    | `/api/posts`             | Feed, newest first (+ like counts)   | 200     | —                 |
| POST   | `/api/posts` 🔒          | Create a tweet (1–280 chars)         | 201     | 400, 401          |
| DELETE | `/api/posts/:id` 🔒      | Delete your own tweet                | 204     | 401, 403, 404     |
| POST   | `/api/posts/:id/like` 🔒 | Like a tweet                         | 201     | 401, 404          |
| DELETE | `/api/posts/:id/like` 🔒 | Unlike a tweet                       | 200     | 401               |
| GET    | `/api/users/:username`   | A user's profile + their tweets      | 200     | 404               |

**Safety notes baked into the code:**
- Every SQL query is **parameterized** (`$1, $2, …`) — never string-concatenated
  — so user input can't be executed as SQL (SQL-injection protection).
- Passwords are stored only as **bcrypt hashes**, never as plain text.
- Tweet text is rendered with `textContent` on the frontend, so it can't inject
  HTML or scripts.

---

## Deploy to Render (Docker, via Blueprint)

Render builds the **same `Dockerfile`** you run locally, so production and local
are the exact same image. The included [`render.yaml`](render.yaml) Blueprint
provisions the web service **and** the database together, already wired up.

### 1. Push this project to GitHub
Render deploys from a Git repository, so commit the project and push it.

### 2. Apply the Blueprint
1. In the Render dashboard: **New ➜ Blueprint**.
2. Connect your GitHub repo. Render reads `render.yaml` and shows a plan: one
   **Postgres** database (`elon-tweet-db`) + one **Docker web service**
   (`elon-tweet`).
3. Click **Apply**. Render creates both, in the same region, and automatically
   sets `DATABASE_URL` (from the database), `SESSION_SECRET` (generated), and
   `NODE_ENV=production` on the web service.

### 3. That's it — no manual schema step
On its first boot the container runs `setup-db.js`, which creates the tables and
loads the seed data into Render's database (the script is idempotent, so later
deploys won't duplicate anything). `PORT` is provided by Render automatically.

When the deploy finishes, open the web service URL, log in as
`ada` / `password123`, and start tweeting. 🎉

> **Prefer clicking over Blueprints?** You can still do it by hand: create a
> Postgres instance and a Docker web service in the **same region**, set
> `DATABASE_URL`, `SESSION_SECRET`, and `NODE_ENV=production` on the service, and
> deploy. The container still loads the schema itself on first boot.

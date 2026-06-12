'use strict';

/* ===========================================================================
   Elon Tweet — frontend logic (vanilla JavaScript, no framework)
   ===========================================================================
   HOW THIS FILE IS ORGANIZED:

     STAGE 1  — FAKE DATA : a hardcoded array of tweets. The whole UI works with
                            NO backend at all.
     STAGE 2  — REAL API  : fetch() calls that talk to our Express server.

   The `Data` object further down is the SINGLE switch between the two stages
   (see USE_FAKE_DATA). Everything below `Data` — state, rendering, events —
   is identical no matter where the tweets come from. That's the whole lesson:
   the UI doesn't care whether data is fake or live.
   =========================================================================== */

// ---- THE SWITCH -----------------------------------------------------------
// true  = run entirely in the browser using FAKE_TWEETS below (open index.html,
//         no server needed).
// false = talk to the real Express + Postgres backend through /api/...
//
// >>> Try flipping this value and watch the SAME interface swap data sources. <<<
const USE_FAKE_DATA = false;

// Max tweet length. Must match the backend (routes/posts.js) and DB CHECK.
const MAX_LENGTH = 280;


/* ===========================================================================
   STAGE 1 — FAKE DATA
   ---------------------------------------------------------------------------
   A pretend database that lives in memory. These functions let the app post,
   like, and delete locally so students can use the full UI before any server
   exists. When USE_FAKE_DATA is false, NONE of this is used.
   =========================================================================== */

// Pretend "logged in" user for the offline demo.
const FAKE_CURRENT_USER = { id: 1, username: 'demo_user' };

// Build timestamps relative to "now" so the times look fresh in the demo.
const _now = Date.now();
const _minsAgo = (m) => new Date(_now - m * 60000).toISOString();

// The fake feed. `let` (not const) because posting/deleting changes the array.
let FAKE_TWEETS = [
  { id: 3, username: 'satoshi',   content: 'just setting up my twttr',                       created_at: _minsAgo(2),   like_count: 9, liked_by_me: false },
  { id: 2, username: 'ada',       content: 'Wrote my first loop today. It looped. 🎉',        created_at: _minsAgo(45),  like_count: 4, liked_by_me: true  },
  { id: 1, username: 'demo_user', content: 'Hello world — this tweet is 100% fake data.',     created_at: _minsAgo(180), like_count: 2, liked_by_me: false },
];
let _fakeNextId = 100; // ids for new fake tweets

function fakeFeed() {
  // newest first, like the real feed query
  return [...FAKE_TWEETS].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
}
function fakeCreate(content) {
  const tweet = {
    id: _fakeNextId++,
    username: FAKE_CURRENT_USER.username,
    content,
    created_at: new Date().toISOString(),
    like_count: 0,
    liked_by_me: false,
  };
  FAKE_TWEETS.push(tweet);
  return tweet;
}
function fakeDelete(id) {
  FAKE_TWEETS = FAKE_TWEETS.filter((t) => t.id !== id);
}
function fakeSetLike(id, liked) {
  const t = FAKE_TWEETS.find((t) => t.id === id);
  if (t) {
    t.liked_by_me = liked;
    t.like_count = Math.max(0, t.like_count + (liked ? 1 : -1));
  }
}
function fakeProfile(username) {
  return {
    user: { username, created_at: _minsAgo(60 * 24 * 30) }, // "joined a month ago"
    posts: fakeFeed().filter((t) => t.username === username),
  };
}


/* ===========================================================================
   STAGE 2 — REAL API
   ---------------------------------------------------------------------------
   Thin helper around fetch(). Every backend call goes through requestJSON so
   error handling and JSON parsing live in one place.
   =========================================================================== */

async function requestJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  // 204 "No Content" responses (logout, delete) have an empty body.
  const body =
    res.status === 204 ? null : await res.json().catch(() => null);

  // Turn any non-2xx response into a thrown Error carrying the server's message.
  if (!res.ok) {
    throw new Error((body && body.error) || `Request failed (${res.status}).`);
  }
  return body;
}


/* ===========================================================================
   THE SWITCH — Data
   ---------------------------------------------------------------------------
   Every method picks fake or real based on USE_FAKE_DATA. This is the ONE place
   the swap happens. The rest of the app only ever calls Data.something().
   =========================================================================== */

const Data = {
  // --- auth ---
  async getMe() {
    if (USE_FAKE_DATA) return FAKE_CURRENT_USER;
    // /api/me returns 401 when logged out; treat that as "no user".
    try {
      return await requestJSON('/api/me');
    } catch {
      return null;
    }
  },
  async register(username, password) {
    if (USE_FAKE_DATA) return FAKE_CURRENT_USER;
    return requestJSON('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  async login(username, password) {
    if (USE_FAKE_DATA) return FAKE_CURRENT_USER;
    return requestJSON('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  async logout() {
    if (USE_FAKE_DATA) return;
    return requestJSON('/api/logout', { method: 'POST' });
  },

  // --- tweets ---
  async getFeed() {
    if (USE_FAKE_DATA) return fakeFeed();
    return requestJSON('/api/posts');
  },
  async createPost(content) {
    if (USE_FAKE_DATA) return fakeCreate(content);
    return requestJSON('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },
  async deletePost(id) {
    if (USE_FAKE_DATA) return fakeDelete(id);
    return requestJSON(`/api/posts/${id}`, { method: 'DELETE' });
  },
  async like(id) {
    if (USE_FAKE_DATA) return fakeSetLike(id, true);
    return requestJSON(`/api/posts/${id}/like`, { method: 'POST' });
  },
  async unlike(id) {
    if (USE_FAKE_DATA) return fakeSetLike(id, false);
    return requestJSON(`/api/posts/${id}/like`, { method: 'DELETE' });
  },

  // --- profiles ---
  async getProfile(username) {
    if (USE_FAKE_DATA) return fakeProfile(username);
    return requestJSON(`/api/users/${encodeURIComponent(username)}`);
  },
};


/* ===========================================================================
   DOM HELPER
   ---------------------------------------------------------------------------
   el() builds an element. IMPORTANT for safety: child strings are added with
   .append(), which creates TEXT nodes — never HTML. So a tweet containing
   "<script>" shows up as literal text and can't run. (XSS protection by default.)
   =========================================================================== */

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else if (key === 'onclick') node.addEventListener('click', value);
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child); // strings -> safe text nodes; nodes -> appended as-is
  }
  return node;
}


/* ===========================================================================
   STATE
   =========================================================================== */

let currentUser = null;            // { id, username } or null when logged out
let view = { type: 'feed' };       // 'feed' (home) or { type:'profile', username }

const main = document.getElementById('main');
const authStatus = document.getElementById('auth-status');


/* ===========================================================================
   RENDERING
   =========================================================================== */

// The "logged in as @x · Log out" strip in the top bar.
function renderAuthStatus() {
  authStatus.replaceChildren();
  if (!currentUser) return;
  authStatus.append(
    el('span', {}, 'Logged in as '),
    el('button', { className: 'linklike', onclick: () => showProfile(currentUser.username) }, '@' + currentUser.username),
    el('button', { className: 'btn-secondary', onclick: handleLogout }, 'Log out')
  );
}

// Login + register forms, shown to logged-out visitors.
function renderAuthForms() {
  const forms = el('div', { className: 'auth-forms' },
    buildAuthForm('Log in', handleLogin),
    buildAuthForm('Create account', handleRegister)
  );
  return el('div', { className: 'auth' },
    el('p', { className: 'auth-intro' }, 'Log in or create an account to tweet, like, and post.'),
    forms
  );
}

function buildAuthForm(label, onSubmit) {
  const username = el('input', { type: 'text', name: 'username', placeholder: 'username', autocomplete: 'username' });
  const password = el('input', { type: 'password', name: 'password', placeholder: 'password', autocomplete: 'current-password' });
  const form = el('form', { className: 'auth-form' },
    el('h3', {}, label),
    username,
    password,
    el('button', { type: 'submit', className: 'btn-primary' }, label)
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); // don't reload the page
    try {
      await onSubmit(username.value.trim(), password.value);
    } catch (err) {
      showMessage(err.message);
    }
  });
  return form;
}

// The "what's happening?" box. Only shown on the home feed when logged in.
function renderComposer() {
  const input = el('textarea', {
    className: 'composer-input',
    rows: '3',
    maxlength: String(MAX_LENGTH),
    placeholder: "What's happening?",
  });
  const counter = el('span', { className: 'counter' }, MAX_LENGTH + ' left');
  const postBtn = el('button', { className: 'btn-primary' }, 'Tweet');
  postBtn.disabled = true; // nothing typed yet

  // Live character counter + enable/disable the button.
  input.addEventListener('input', () => {
    const left = MAX_LENGTH - input.value.length;
    counter.textContent = left + ' left';
    counter.classList.toggle('counter-warn', left < 20);
    postBtn.disabled = input.value.trim().length === 0;
  });

  postBtn.addEventListener('click', async () => {
    const content = input.value.trim();
    if (!content) return;
    postBtn.disabled = true;
    try {
      await Data.createPost(content);
      input.value = '';
      await reloadView(); // pull the fresh feed (now including our tweet)
    } catch (err) {
      showMessage(err.message);
      postBtn.disabled = false;
    }
  });

  return el('div', { className: 'composer' },
    input,
    el('div', { className: 'composer-footer' }, counter, postBtn)
  );
}

// One tweet card.
function renderTweet(tweet) {
  // Header: @username (click -> their profile) · time
  const head = el('div', { className: 'tweet-head' },
    el('button', { className: 'username linklike', onclick: () => showProfile(tweet.username) }, '@' + tweet.username),
    el('span', { className: 'muted' }, '·'),
    el('span', { className: 'muted', title: tweet.created_at }, formatRelative(tweet.created_at))
  );

  // The tweet text. Passed as a string child => rendered as safe text.
  const body = el('p', { className: 'tweet-content' }, tweet.content);

  // Like button: outline heart normally, filled red once liked.
  const likeBtn = el('button',
    { className: 'like-btn' + (tweet.liked_by_me ? ' liked' : ''), onclick: () => handleLike(tweet) },
    (tweet.liked_by_me ? '♥ ' : '♡ ') + tweet.like_count
  );

  const actions = el('div', { className: 'tweet-actions' }, likeBtn);

  // Only show Delete on your OWN tweets.
  if (currentUser && tweet.username === currentUser.username) {
    actions.append(
      el('button', { className: 'delete-btn', onclick: () => handleDelete(tweet) }, 'Delete')
    );
  }

  return el('article', { className: 'tweet' }, head, body, actions);
}

// Draw the whole page body for the current view (home feed or a profile).
function renderMain({ heading, subheading, tweets, isProfile }) {
  main.replaceChildren();

  // Logged out: show the login/register forms above the read-only feed.
  if (!currentUser) {
    main.append(renderAuthForms());
  } else if (!isProfile) {
    // Logged in on the home feed: show the composer.
    main.append(renderComposer());
  }

  // Heading (with a back-to-home link on profile pages).
  const header = el('div', { className: 'feed-header' });
  if (isProfile) {
    header.append(el('button', { className: 'linklike', onclick: showFeed }, '← Home'));
  }
  header.append(el('h2', { className: 'feed-title' }, heading));
  if (subheading) header.append(el('p', { className: 'muted' }, subheading));
  main.append(header);

  // The list of tweets (or an empty-state message).
  if (tweets.length === 0) {
    main.append(el('p', { className: 'muted empty' }, 'No tweets yet.'));
  } else {
    const list = el('div', { className: 'feed' });
    tweets.forEach((t) => list.append(renderTweet(t)));
    main.append(list);
  }
}


/* ===========================================================================
   VIEW LOADERS — fetch data, then render
   =========================================================================== */

async function showFeed() {
  view = { type: 'feed' };
  try {
    const tweets = await Data.getFeed();
    renderMain({ heading: 'Home', tweets });
  } catch (err) {
    showMessage(err.message);
  }
}

async function showProfile(username) {
  view = { type: 'profile', username };
  try {
    const { user, posts } = await Data.getProfile(username);
    renderMain({
      heading: '@' + user.username,
      subheading: 'Joined ' + formatDate(user.created_at),
      tweets: posts,
      isProfile: true,
    });
  } catch (err) {
    showMessage(err.message);
  }
}

// Re-load whichever view we're currently looking at (after posting/liking/etc).
function reloadView() {
  return view.type === 'profile' ? showProfile(view.username) : showFeed();
}


/* ===========================================================================
   EVENT HANDLERS
   =========================================================================== */

async function handleLogin(username, password) {
  currentUser = await Data.login(username, password);
  afterAuthChange();
}

async function handleRegister(username, password) {
  currentUser = await Data.register(username, password);
  afterAuthChange();
}

async function handleLogout() {
  await Data.logout();
  currentUser = null;
  afterAuthChange();
}

function afterAuthChange() {
  renderAuthStatus();
  showFeed();
}

async function handleLike(tweet) {
  if (!currentUser) {
    showMessage('Log in to like tweets.');
    return;
  }
  try {
    // We trust the boolean we already have to decide which way to toggle.
    if (tweet.liked_by_me) {
      await Data.unlike(tweet.id);
    } else {
      await Data.like(tweet.id);
    }
    await reloadView();
  } catch (err) {
    showMessage(err.message);
  }
}

async function handleDelete(tweet) {
  if (!window.confirm('Delete this tweet?')) return;
  try {
    await Data.deletePost(tweet.id);
    await reloadView();
  } catch (err) {
    showMessage(err.message);
  }
}


/* ===========================================================================
   HELPERS
   =========================================================================== */

// Pop a brief message banner (errors, "log in to like", etc).
let _messageTimer = null;
function showMessage(text) {
  const banner = document.getElementById('message');
  banner.textContent = text;
  banner.classList.add('show');
  clearTimeout(_messageTimer);
  _messageTimer = setTimeout(() => banner.classList.remove('show'), 3000);
}

// "5s", "12m", "3h", "2d", then fall back to a date.
function formatRelative(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd';
  return formatDate(iso);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}


/* ===========================================================================
   START THE APP
   =========================================================================== */

// Clicking the title always returns to the home feed.
document.getElementById('brand').addEventListener('click', showFeed);

async function init() {
  currentUser = await Data.getMe(); // null if not logged in
  renderAuthStatus();
  await showFeed();
}

init();

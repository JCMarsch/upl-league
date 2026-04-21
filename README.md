# UPL — Pokemon Draft League

A full-stack web application for running Pokemon VGC/Singles draft leagues. Handles pre-season setup, live snake drafting, match reporting, stat tracking, replay parsing, and historical records.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11+ · FastAPI · SQLAlchemy · Alembic |
| Frontend | React 18 · Vite · TypeScript · Tailwind CSS · Zustand |
| Database | PostgreSQL (pg8000 driver) |
| Auth | JWT stored in httpOnly cookies |
| Real-time | WebSockets (live draft room) |
| Tests | pytest · Vitest · MSW |
| Hosting | Railway |

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker + Docker Compose (recommended)

### Option 1: Docker (Recommended)

```bash
cp .env.example .env
# Edit .env if needed (defaults work for Docker)
docker-compose up
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

### Option 2: Manual Setup

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env
# Edit .env — set DATABASE_URL to your local Postgres instance
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## Running Tests

```bash
# Both suites at once
make test

# Backend only
cd backend && pytest --cov=app --cov-report=term-missing

# Frontend only
cd frontend && npm run test
```

---

## Deploying to Railway

### Step 1 — Create a Railway account and new project

1. Go to [railway.app](https://railway.app) and sign in (GitHub login works).
2. Click **New Project**.
3. Choose **Deploy from GitHub repo**.
4. Authorize Railway to access your GitHub if prompted, then select **JCMarsch/upl-league**.
5. Railway will show you a service card. **Do not deploy yet** — you need to add a database and set variables first.

---

### Step 2 — Add a Postgres database

1. In your project dashboard, click the **+ New** button (top right).
2. Select **Database** → **Add PostgreSQL**.
3. Railway will create a Postgres service. Wait a few seconds for it to appear in the dashboard.

---

### Step 3 — Get your database connection string

1. Click on the **Postgres service** (the purple card).
2. Go to the **Variables** tab.
3. Find the variable called `DATABASE_URL`. Click the copy icon next to it.
4. It will look something like this:
   ```
   postgresql://postgres:abc123@roundhouse.proxy.rlwy.net:12345/railway
   ```
5. You need to change `postgresql://` to `postgresql+pg8000://`. So the final string you'll use is:
   ```
   postgresql+pg8000://postgres:abc123@roundhouse.proxy.rlwy.net:12345/railway
   ```
   (just swap the prefix — everything after `://` stays exactly the same)

---

### Step 4 — Generate a secret key

Open a terminal on your computer and run:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```
Copy the output — it will be a long string of random letters and numbers. This is your `SECRET_KEY`.

If you don't have Python locally, you can use any random string generator online to make a 64-character random string.

---

### Step 5 — Set environment variables on the web service

1. In your Railway project, click on the **web service card** (the one connected to your GitHub repo, not the Postgres one).
2. Click the **Variables** tab.
3. You will see a form with **Name** and **Value** fields. Add each variable below one at a time by typing the name, pasting the value, and clicking **Add**.

Add these variables:

| Name | Value |
|------|-------|
| `DATABASE_URL` | Your modified connection string from Step 3 (the one starting with `postgresql+pg8000://`) |
| `SECRET_KEY` | The random string you generated in Step 4 |
| `ENVIRONMENT` | `production` |
| `ALLOWED_ORIGINS` | Leave this for now — you'll fill it in after Step 6 |

---

### Step 6 — Generate your public URL

1. Still on the web service, click the **Settings** tab.
2. Scroll down to **Networking**.
3. Click **Generate Domain**.
4. Railway will give you a URL like `https://upl-league-production.up.railway.app`. Copy it.
5. Go back to the **Variables** tab and add:

| Name | Value |
|------|-------|
| `ALLOWED_ORIGINS` | Your full URL from above, e.g. `https://upl-league-production.up.railway.app` |

---

### Step 7 — Deploy

1. Click the **Deploy** button on your web service.
2. Click **View Logs** to watch the build. It will take 2–4 minutes the first time.
3. You should see it run through: installing Node packages, building the frontend, installing Python packages, running database migrations, then starting the server.
4. When you see `Application startup complete` in the logs, the app is live.

If the build fails, the logs will show exactly which step errored. The most common issue is the `DATABASE_URL` prefix — double-check it starts with `postgresql+pg8000://`.

---

### Step 8 — Create your superadmin account (run once)

The easiest way is via the Railway dashboard:

1. Click on your web service → **Settings** tab → scroll to **Deploy** section.
2. Find the **Custom Start Command** field and temporarily replace it with:
   ```
   cd backend && python scripts/create_superadmin.py
   ```
3. Redeploy, then watch the logs — it will prompt for a username/email/password but you can't type interactively this way.

**Easier alternative — use the Railway CLI:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Log in
railway login

# From inside the upl-league folder:
railway link       # select your project when prompted
railway shell      # opens a shell inside your deployed service

# Then inside the shell:
cd backend && python scripts/create_superadmin.py
```

After creating your superadmin, restore the original start command in Settings (or just redeploy from GitHub — Railway will pick up `railway.toml` again).

---

### Step 9 — Seed Pokemon data (run once)

In the Railway shell (same as above):
```bash
cd backend && python scripts/seed_pokemon.py
```
This fetches Pokemon data from PokeAPI and takes 2–3 minutes.

---

### You're live

Visit your Railway URL, log in as superadmin, and go to the **Admin** panel to create your first season.

---

## Environment Variables

See `.env.example` for full documentation. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (use `postgresql+pg8000://` prefix) |
| `SECRET_KEY` | JWT signing key — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (e.g. `https://yourdomain.com`) |
| `SMTP_*` | Email credentials for notifications (optional) |
| `DISCORD_WEBHOOK_URL` | Discord webhook for event notifications (optional) |
| `ENVIRONMENT` | `development` or `production` (controls log format) |

---

## Project Structure

```
upl-site/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, middleware, SPA fallback
│   │   ├── config.py        # Settings from env vars
│   │   ├── auth.py          # JWT + dependency helpers
│   │   ├── security.py      # bcrypt password hashing
│   │   ├── database.py      # SQLAlchemy engine + session
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── routers/         # FastAPI route handlers
│   │   └── services/        # Business logic (draft, schedule, stats, replay parser)
│   ├── alembic/             # Database migrations
│   ├── scripts/             # seed_pokemon.py, seed_test_data.py, create_superadmin.py
│   ├── tests/               # pytest test suite
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/           # Route-level page components
│   │   ├── components/      # Shared UI components
│   │   ├── store/           # Zustand state (auth, theme)
│   │   └── index.css        # CSS variable theme system
│   └── package.json
├── docker-compose.yml
├── railway.toml
├── Procfile
└── .env.example
```

---

## Season Workflow

1. **Admin creates season** — sets roster size, point budget, format
2. **Admin imports Pokemon pool** — assigns tiers and point costs
3. **Admin locks tiers** — prevents changes once draft starts
4. **Draft begins** — snake draft order, live WebSocket room, timer per pick
5. **Schedule generated** — round-robin, one week per matchday
6. **Regular season** — teams submit match results, opponent confirms
7. **Playoffs** — bracket play (if configured)
8. **Season close** — champion recorded, auto-awards calculated, history preserved

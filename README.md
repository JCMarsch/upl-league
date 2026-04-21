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

### Step 1 — Push your code to GitHub

Make sure the repo is on GitHub (public or private, doesn't matter).

### Step 2 — Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in.
2. Click **New Project → Deploy from GitHub repo** and select this repo.
3. Railway will detect `railway.toml` and configure the build automatically. Don't click Deploy yet.

### Step 3 — Add a Postgres database

1. In your Railway project, click **+ New** → **Database** → **PostgreSQL**.
2. Once it provisions, click the Postgres service → **Connect** tab.
3. Copy the **DATABASE_URL** shown there. It will look like:
   ```
   postgresql://user:pass@host.railway.internal:5432/railway
   ```
4. Change `postgresql://` to `postgresql+pg8000://` (required — this app uses the pg8000 driver):
   ```
   postgresql+pg8000://user:pass@host.railway.internal:5432/railway
   ```

### Step 4 — Set environment variables

In your Railway project, click your **web service** → **Variables** tab → **Raw Editor** and paste:

```
DATABASE_URL=postgresql+pg8000://user:pass@host.railway.internal:5432/railway
SECRET_KEY=<generate one: python -c "import secrets; print(secrets.token_hex(32))">
ALLOWED_ORIGINS=https://<your-railway-app>.up.railway.app
ENVIRONMENT=production
```

Optional (for email/Discord notifications):
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Step 5 — Deploy

Click **Deploy** (or push a commit — Railway redeploys on every push to `main`).

The build will:
1. Build the React frontend → `frontend/dist/`
2. Install Python dependencies
3. Run `alembic upgrade head` (database migrations)
4. Start the FastAPI server, which also serves the frontend

You can watch the build logs in real time in the Railway dashboard.

### Step 6 — First-time setup (run once after deploy)

Install the Railway CLI if you haven't: `npm install -g @railway/cli`

```bash
# Log in to Railway CLI
railway login

# Link to your project (run from the repo root)
railway link

# Create the superadmin account
railway run --service <your-service-name> python backend/scripts/create_superadmin.py

# Seed Pokemon data (pulls from PokeAPI — takes ~2-3 minutes)
railway run --service <your-service-name> python backend/scripts/seed_pokemon.py
```

Then visit your Railway URL, log in as superadmin, and create your first season from the Admin panel.

### Finding your app URL

In the Railway dashboard: click your web service → **Settings** → **Networking** → **Generate Domain**. This gives you a `https://<name>.up.railway.app` URL.

> Remember to add that URL to the `ALLOWED_ORIGINS` variable (Step 4).

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

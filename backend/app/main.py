import asyncio
import logging
import sys
import json
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import settings
from app.routers import health, auth, seasons, tiers, draft, teams, matches, standings, transactions, history, notifications, admin, analytics


def configure_logging():
    if settings.environment == "production":
        class JsonFormatter(logging.Formatter):
            def format(self, record):
                log_record = {
                    "level": record.levelname,
                    "message": record.getMessage(),
                    "logger": record.name,
                    "time": self.formatTime(record, self.datefmt),
                }
                if record.exc_info:
                    log_record["exc_info"] = self.formatException(record.exc_info)
                return json.dumps(log_record)

        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logging.root.setLevel(logging.INFO)
        logging.root.handlers = [handler]
    else:
        logging.basicConfig(level=logging.INFO)


configure_logging()
logger = logging.getLogger(__name__)


def _run_scheduled_jobs():
    """Run waiver auto-processing and trade auto-execution."""
    from app.database import SessionLocal
    from app.models.season import Season
    from app.models.transaction import Trade
    from app.models.config import LeagueConfig
    from app.services.waiver_service import run_waiver_processing
    from datetime import datetime, timezone, timedelta

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # Auto-process waivers for active seasons whose schedule matches now
        active_seasons = db.query(Season).filter(
            Season.status.in_(["regular", "playoffs"])
        ).all()

        for season in active_seasons:
            def cfg(key):
                row = db.query(LeagueConfig).filter(
                    LeagueConfig.season_id == season.id,
                    LeagueConfig.key == key,
                ).first()
                return int(row.value) if row else None

            day = cfg("waiver_day")
            hour = cfg("waiver_hour")
            minute = cfg("waiver_minute")

            if day is None:
                continue

            # Run if current UTC weekday/hour/minute matches (within a 5-min window)
            if now.weekday() == day and now.hour == hour and abs(now.minute - minute) <= 5:
                count = run_waiver_processing(db, season.id)
                logger.info(f"Auto-processed {count} waivers for season {season.id}")

        # Auto-execute trades approved 2+ days ago
        ready_trades = db.query(Trade).filter(
            Trade.status == "approved",
            Trade.approved_at <= now - timedelta(days=2),
        ).all()

        for trade in ready_trades:
            from app.routers.admin import _execute_trade
            _execute_trade(db, trade)
            logger.info(f"Auto-executed trade {trade.id}")

    except Exception as e:
        logger.error(f"Scheduled job error: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app):
    from apscheduler.schedulers.background import BackgroundScheduler
    from app import scheduler as draft_scheduler
    from app.routers.draft import broadcast as draft_broadcast

    scheduler = BackgroundScheduler()
    scheduler.add_job(_run_scheduled_jobs, "interval", minutes=5)
    scheduler.start()

    loop = asyncio.get_running_loop()
    draft_scheduler.init(scheduler, loop, draft_broadcast)

    logger.info("Scheduler started")
    yield
    scheduler.shutdown()


app = FastAPI(title="UPL API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(auth.router)
app.include_router(seasons.router)
app.include_router(tiers.router)
app.include_router(draft.router)
app.include_router(teams.router)
app.include_router(matches.router)
app.include_router(standings.router)
app.include_router(transactions.router)
app.include_router(history.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(analytics.router)

# Serve frontend static files in production
FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(request: Request, full_path: str):
        if full_path.startswith("api/") or full_path == "health":
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
        from fastapi import HTTPException
        raise HTTPException(status_code=404)

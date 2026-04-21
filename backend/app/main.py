import logging
import sys
import json
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import settings
from app.routers import health, auth, seasons, tiers, draft, teams, matches, standings, transactions, history, notifications


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

from contextlib import asynccontextmanager
from app.database import engine, Base
from app.models import *  # noqa: ensure all models are registered


@asynccontextmanager
async def lifespan(app):
    if settings.environment == "production":
        Base.metadata.create_all(bind=engine)
    yield


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

# Serve frontend static files in production
FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(request: Request, full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api/") or full_path == "health":
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
        from fastapi import HTTPException
        raise HTTPException(status_code=404)

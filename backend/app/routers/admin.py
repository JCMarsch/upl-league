from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
import logging

logger = logging.getLogger(__name__)
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel
import threading
from app.database import get_db
from app.auth import require_admin
from app.models.user import User
from app.models.team import Team
from app.models.season import Season
from app.models.schedule import Match, Game, GameStat
from app.models.transaction import Trade, TradeAsset, Waiver
from app.models.pokemon import SeasonPokemon, RosterPokemon
from app.models.config import LeagueConfig
from app.services.pokemon_seed import run_seed
from app.database import SessionLocal

router = APIRouter(prefix="/admin", tags=["admin"])

# Simple in-process seed status (reset on server restart)
_seed_status: dict = {"running": False, "done": 0, "total": 0, "result": None, "error": None}
_seed_lock = threading.Lock()


def _do_seed():
    global _seed_status
    db = SessionLocal()
    try:
        def on_progress(done: int, total: int):
            with _seed_lock:
                _seed_status["done"] = done
                _seed_status["total"] = total

        result = run_seed(db, progress_cb=on_progress)
        with _seed_lock:
            _seed_status = {"running": False, "done": result.get("created", 0) + result.get("updated", 0), "total": _seed_status["total"], "result": result, "error": None}
    except Exception as e:
        with _seed_lock:
            _seed_status = {"running": False, "done": 0, "total": 0, "result": None, "error": str(e)}
    finally:
        db.close()


# ── Schemas ──────────────────────────────────────────────────────────────────

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    roles: Optional[str] = None

class TeamUpdate(BaseModel):
    name: Optional[str] = None
    manager_id: Optional[int] = None
    abbreviation: Optional[str] = None
    points_remaining: Optional[int] = None

class MatchUpdate(BaseModel):
    home_games_won: Optional[int] = None
    away_games_won: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class GameStatUpdate(BaseModel):
    was_brought: Optional[bool] = None
    was_lead: Optional[bool] = None
    direct_kills: Optional[int] = None
    passive_kills: Optional[int] = None
    direct_deaths: Optional[int] = None
    passive_deaths: Optional[int] = None

class WaiverSchedule(BaseModel):
    day_of_week: int   # 0=Monday … 6=Sunday
    hour: int          # 0-23 UTC
    minute: int        # 0-59

class SeasonUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    format: Optional[str] = None
    year: Optional[int] = None
    points_budget: Optional[int] = None
    roster_size: Optional[int] = None
    draft_timer_seconds: Optional[int] = None
    series_format: Optional[str] = None


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.username).all()
    return [
        {"id": u.id, "username": u.username, "email": u.email, "roles": u.roles, "created_at": u.created_at}
        for u in users
    ]


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.username is not None:
        existing = db.query(User).filter(User.username == data.username, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = data.username
    if data.email is not None:
        user.email = data.email
    if data.roles is not None:
        user.roles = data.roles
    db.commit()
    return {"id": user.id, "username": user.username, "email": user.email, "roles": user.roles}


# ── Seasons ───────────────────────────────────────────────────────────────────

@router.patch("/seasons/{season_id}")
def admin_update_season(
    season_id: int,
    data: SeasonUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    update_data = data.model_dump(exclude_none=True)
    logger.info(f"admin_update_season: season_id={season_id} fields={list(update_data.keys())}")
    for field, value in update_data.items():
        setattr(season, field, value)
        # JSON columns need explicit dirty-flag so SQLAlchemy doesn't skip the write
        if field == 'required_slots':
            flag_modified(season, 'required_slots')
    db.commit()
    logger.info(f"admin_update_season: saved required_slots={season.required_slots}")
    return {"id": season.id, "name": season.name, "status": season.status, "required_slots": season.required_slots}


# ── Teams ─────────────────────────────────────────────────────────────────────

@router.patch("/teams/{team_id}")
def update_team(
    team_id: int,
    data: TeamUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if data.manager_id is not None:
        manager = db.query(User).filter(User.id == data.manager_id).first()
        if not manager:
            raise HTTPException(status_code=404, detail="User not found")
        team.manager_id = data.manager_id
    if data.name is not None:
        team.name = data.name
    if data.abbreviation is not None:
        team.abbreviation = data.abbreviation
    if data.points_remaining is not None:
        team.points_remaining = data.points_remaining
    db.commit()
    return {"id": team.id, "name": team.name, "manager_id": team.manager_id}


# ── Matches ───────────────────────────────────────────────────────────────────

@router.patch("/matches/{match_id}")
def update_match(
    match_id: int,
    data: MatchUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if data.home_games_won is not None:
        match.home_games_won = data.home_games_won
    if data.away_games_won is not None:
        match.away_games_won = data.away_games_won
    if data.status is not None:
        match.status = data.status
    if data.notes is not None:
        match.notes = data.notes
    # Recalculate winner
    if match.home_games_won is not None and match.away_games_won is not None:
        if match.home_games_won > match.away_games_won:
            match.winner_team_id = match.home_team_id
        elif match.away_games_won > match.home_games_won:
            match.winner_team_id = match.away_team_id
        else:
            match.winner_team_id = None
    db.commit()
    return {"id": match.id, "status": match.status, "home_games_won": match.home_games_won, "away_games_won": match.away_games_won}


@router.patch("/matches/{match_id}/games/{game_id}/stats/{stat_id}")
def update_game_stat(
    match_id: int,
    game_id: int,
    stat_id: int,
    data: GameStatUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    stat = db.query(GameStat).filter(
        GameStat.id == stat_id,
        GameStat.game_id == game_id,
    ).first()
    if not stat:
        raise HTTPException(status_code=404, detail="Stat not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(stat, field, value)
    db.commit()
    return {"id": stat.id, "game_id": stat.game_id}


@router.get("/matches/{match_id}/games")
def get_match_games(
    match_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    result = []
    for game in match.games:
        result.append({
            "id": game.id,
            "game_number": game.game_number,
            "winner_team_id": game.winner_team_id,
            "stats": [
                {
                    "id": s.id,
                    "team_id": s.team_id,
                    "species_id": s.species_id,
                    "was_brought": s.was_brought,
                    "was_lead": s.was_lead,
                    "direct_kills": s.direct_kills,
                    "passive_kills": s.passive_kills,
                    "direct_deaths": s.direct_deaths,
                    "passive_deaths": s.passive_deaths,
                }
                for s in game.stats
            ]
        })
    return result


# ── Waivers ───────────────────────────────────────────────────────────────────

@router.get("/seasons/{season_id}/waiver-schedule")
def get_waiver_schedule(
    season_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    def cfg(key):
        row = db.query(LeagueConfig).filter(
            LeagueConfig.season_id == season_id,
            LeagueConfig.key == key,
        ).first()
        return row.value if row else None

    return {
        "day_of_week": int(cfg("waiver_day") or 2),
        "hour": int(cfg("waiver_hour") or 22),
        "minute": int(cfg("waiver_minute") or 0),
    }


@router.post("/seasons/{season_id}/waiver-schedule")
def set_waiver_schedule(
    season_id: int,
    data: WaiverSchedule,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    for key, value in [
        ("waiver_day", str(data.day_of_week)),
        ("waiver_hour", str(data.hour)),
        ("waiver_minute", str(data.minute)),
    ]:
        row = db.query(LeagueConfig).filter(
            LeagueConfig.season_id == season_id,
            LeagueConfig.key == key,
        ).first()
        if row:
            row.value = value
            row.updated_by_id = current_user.id
        else:
            db.add(LeagueConfig(season_id=season_id, key=key, value=value, updated_by_id=current_user.id))
    db.commit()
    return {"day_of_week": data.day_of_week, "hour": data.hour, "minute": data.minute}


@router.post("/seasons/{season_id}/waivers/process-all")
def process_all_waivers(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    from app.services.waiver_service import run_waiver_processing
    processed = run_waiver_processing(db, season_id, current_user.id)
    return {"processed": processed}


# ── Trades ────────────────────────────────────────────────────────────────────

@router.post("/trades/{trade_id}/force-execute")
def force_execute_trade(
    trade_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade.status not in ["approved"]:
        raise HTTPException(status_code=400, detail="Trade must be approved before executing")
    _execute_trade(db, trade)
    return {"status": "executed"}


def _execute_trade(db: Session, trade: Trade):
    for asset in trade.assets:
        sp = asset.season_pokemon
        sp.drafted_by_team_id = asset.to_team_id
        sp.acquired_via = "trade"
        db.query(RosterPokemon).filter(
            RosterPokemon.season_pokemon_id == sp.id
        ).update({"team_id": asset.to_team_id})
    trade.status = "executed"
    trade.resolved_at = datetime.now(timezone.utc)
    db.commit()


@router.post("/seed-pokemon")
def start_seed_pokemon(
    background_tasks: BackgroundTasks,
    _: User = Depends(require_admin),
):
    with _seed_lock:
        if _seed_status["running"]:
            raise HTTPException(status_code=409, detail="Seed already in progress")
        _seed_status["running"] = True
        _seed_status["done"] = 0
        _seed_status["total"] = 0
        _seed_status["result"] = None
        _seed_status["error"] = None
    background_tasks.add_task(_do_seed)
    return {"status": "started"}


@router.get("/seed-pokemon/status")
def get_seed_status(_: User = Depends(require_admin)):
    with _seed_lock:
        return dict(_seed_status)

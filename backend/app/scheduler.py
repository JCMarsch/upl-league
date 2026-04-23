"""Singleton APScheduler instance for draft timer enforcement."""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Callable, Any

logger = logging.getLogger(__name__)

_scheduler: Any = None
_loop: Optional[asyncio.AbstractEventLoop] = None
_broadcast_fn: Optional[Callable] = None


def init(scheduler, loop: asyncio.AbstractEventLoop, broadcast_fn: Callable):
    global _scheduler, _loop, _broadcast_fn
    _scheduler = scheduler
    _loop = loop
    _broadcast_fn = broadcast_fn


def schedule_autopick(season_id: int, pick_number: int, run_at: datetime):
    if not _scheduler:
        return
    job_id = f"autopick_{season_id}"
    try:
        _scheduler.remove_job(job_id)
    except Exception:
        pass
    _scheduler.add_job(
        _do_autopick,
        trigger='date',
        run_date=run_at,
        args=[season_id, pick_number],
        id=job_id,
        misfire_grace_time=30,
    )
    logger.info(f"Autopick scheduled: season {season_id} pick {pick_number} at {run_at}")


def cancel_autopick(season_id: int):
    if not _scheduler:
        return
    job_id = f"autopick_{season_id}"
    try:
        _scheduler.remove_job(job_id)
    except Exception:
        pass


def _do_autopick(season_id: int, expected_pick_number: int):
    from app.database import SessionLocal
    from app.models.draft import Draft, DraftOrder
    from app.models.pokemon import SeasonPokemon, RosterPokemon
    from app.models.season import Season
    from app.models.team import Team
    from app.services import draft_service

    db = SessionLocal()
    try:
        draft = db.query(Draft).filter(Draft.season_id == season_id).first()
        if not draft or draft.status != 'active':
            return
        if draft.current_pick_number != expected_pick_number:
            return  # Pick already made by the team

        season = db.query(Season).filter(Season.id == season_id).first()
        team = db.query(Team).filter(Team.id == draft.current_team_id).first()
        if not team:
            return

        team_ids = [
            t.id for t in db.query(Team).filter(Team.season_id == season_id).order_by(Team.id).all()
        ]

        sp = draft_service.get_best_autopick(db, season_id, team, season)
        if not sp:
            # Final fallback: any legal undrafted pokemon that fits the budget
            sp = (
                db.query(SeasonPokemon)
                .filter(
                    SeasonPokemon.season_id == season_id,
                    SeasonPokemon.is_legal == True,
                    SeasonPokemon.drafted_by_team_id == None,
                    SeasonPokemon.point_cost <= team.points_remaining,
                )
                .first()
            )
        if not sp:
            logger.warning(f"Autopick: no affordable pokemon for season {season_id} pick {expected_pick_number} — ending draft")
            draft.status = "complete"
            db.commit()
            return

        # make_pick handles roster entry + single db.commit
        pick = draft_service.make_pick(db, draft, team.id, sp.id, season, team_ids)

        logger.info(f"Autopick: season {season_id} pick {pick.pick_number} team {team.id} → {sp.id}")

        # Broadcast state change to all connected clients
        if _loop and _broadcast_fn:
            asyncio.run_coroutine_threadsafe(
                _broadcast_fn(season_id, {"type": "state_change"}),
                _loop
            )

        # Schedule timer for the next pick
        db.refresh(draft)
        if draft.status == 'active' and draft.timer_seconds and draft.pick_started_at:
            run_at = draft.pick_started_at + timedelta(seconds=draft.timer_seconds + 1.5)
            schedule_autopick(season_id, draft.current_pick_number, run_at)

    except Exception as e:
        logger.error(f"Autopick error for season {season_id}: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.auth import get_current_user, require_admin
from app.models.season import Season
from app.models.team import Team
from app.models.schedule import Schedule, Match, Game, GameStat
from app.models.user import User
from app.schemas.match import MatchSubmit, MatchOut, ScheduleOut, GameStatCreate
from app.services.schedule_service import generate_round_robin
from app.services import stats_service
from typing import List

router = APIRouter(tags=["matches"])


@router.post("/seasons/{season_id}/schedule/generate")
def generate_schedule(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    teams = db.query(Team).filter(Team.season_id == season_id).all()
    team_ids = [t.id for t in teams]

    if len(team_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 teams")

    rounds = generate_round_robin(team_ids)

    for week_num, round_fixtures in enumerate(rounds, start=1):
        for home_id, away_id in round_fixtures:
            sched = Schedule(
                season_id=season_id,
                week_number=week_num,
                home_team_id=home_id,
                away_team_id=away_id,
            )
            db.add(sched)
            db.flush()
            match = Match(
                schedule_id=sched.id,
                season_id=season_id,
                week_number=week_num,
                home_team_id=home_id,
                away_team_id=away_id,
            )
            db.add(match)

    db.commit()
    return {"message": "Schedule generated", "weeks": len(rounds)}


@router.get("/seasons/{season_id}/schedule", response_model=List[ScheduleOut])
def get_schedule(season_id: int, db: Session = Depends(get_db)):
    return db.query(Schedule).filter(Schedule.season_id == season_id).all()


@router.get("/matches/{match_id}", response_model=MatchOut)
def get_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


@router.post("/matches/{match_id}/submit", response_model=MatchOut)
def submit_result(
    match_id: int,
    data: MatchSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    if match.status == "confirmed":
        raise HTTPException(status_code=400, detail="Match already confirmed")

    is_admin = any(r in current_user.roles.split(",") for r in ["admin", "superadmin"])
    is_home_manager = (
        db.query(Team).filter(
            Team.id == match.home_team_id, Team.manager_id == current_user.id
        ).first() is not None
    )
    is_away_manager = (
        db.query(Team).filter(
            Team.id == match.away_team_id, Team.manager_id == current_user.id
        ).first() is not None
    )

    if not is_admin and not is_home_manager and not is_away_manager:
        raise HTTPException(status_code=403, detail="Not authorized to submit this match")

    if match.status == "submitted" and match.submitted_by_id != current_user.id:
        # Check for conflicting result
        if (match.home_games_won != data.home_games_won or
                match.away_games_won != data.away_games_won):
            match.status = "disputed"
            db.commit()
            return match

    match.home_games_won = data.home_games_won
    match.away_games_won = data.away_games_won
    if data.notes:
        match.notes = data.notes
    match.submitted_by_id = current_user.id

    # Determine winner
    if data.home_games_won > data.away_games_won:
        match.winner_team_id = match.home_team_id
    elif data.away_games_won > data.home_games_won:
        match.winner_team_id = match.away_team_id
    else:
        match.winner_team_id = None  # draw

    match.status = "submitted"
    db.commit()
    db.refresh(match)
    return match


@router.post("/matches/{match_id}/confirm", response_model=MatchOut)
def confirm_result(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    if match.status != "submitted":
        raise HTTPException(status_code=400, detail="Match must be in submitted state")

    # Submitter cannot confirm their own result
    is_admin = any(r in current_user.roles.split(",") for r in ["admin", "superadmin"])
    if not is_admin and match.submitted_by_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot confirm your own submission")

    is_opponent = (
        db.query(Team).filter(
            (Team.id == match.home_team_id) | (Team.id == match.away_team_id),
            Team.manager_id == current_user.id,
        ).first() is not None
    )
    if not is_admin and not is_opponent:
        raise HTTPException(status_code=403, detail="Not authorized to confirm this match")

    match.status = "confirmed"
    match.confirmed_by_id = current_user.id
    match.confirmed_at = datetime.now(timezone.utc)
    db.commit()

    # Recalculate stats
    stats_service.recalculate_team_stats(db, match.season_id)

    db.refresh(match)
    return match


@router.post("/matches/{match_id}/games/{game_id}/stats")
def submit_game_stats(
    match_id: int,
    game_id: int,
    stats: List[GameStatCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    game = db.query(Game).filter(Game.id == game_id, Game.match_id == match_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Clear existing stats
    db.query(GameStat).filter(GameStat.game_id == game_id).delete()

    for stat in stats:
        gs = GameStat(
            game_id=game_id,
            team_id=stat.team_id,
            species_id=stat.species_id,
            was_brought=stat.was_brought,
            was_lead=stat.was_lead,
            direct_kills=stat.direct_kills,
            passive_kills=stat.passive_kills,
            direct_deaths=stat.direct_deaths,
            passive_deaths=stat.passive_deaths,
        )
        db.add(gs)

    db.commit()
    return {"message": "Stats saved", "count": len(stats)}

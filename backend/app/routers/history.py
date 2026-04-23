from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone
from app.database import get_db
from app.auth import require_admin, get_current_user
from app.models.season import Season
from app.models.team import Team
from app.models.stats import TeamSeasonStats, PokemonSeasonStats, Award, SeasonResult
from app.models.schedule import GameStat, GameKillEvent, Game, Match
from app.models.pokemon import PokemonSpecies
from app.models.user import User
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(tags=["history"])


class AwardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    recipient_team_id: Optional[int] = None
    is_auto_calculated: bool = False
    auto_calc_metric: Optional[str] = None
    recipient_notes: Optional[str] = None


@router.post("/seasons/{season_id}/close")
def close_season(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status == "complete":
        raise HTTPException(status_code=400, detail="Season already closed")

    # Get final standings
    stats_list = db.query(TeamSeasonStats).filter(
        TeamSeasonStats.season_id == season_id
    ).all()

    # Sort by win percentage
    stats_sorted = sorted(stats_list, key=lambda s: (-(s.win_percentage or 0), -(s.match_wins or 0)))

    for rank, s in enumerate(stats_sorted, start=1):
        result = db.query(SeasonResult).filter(
            SeasonResult.season_id == season_id,
            SeasonResult.team_id == s.team_id,
        ).first()
        if not result:
            result = SeasonResult(season_id=season_id, team_id=s.team_id)
            db.add(result)
        result.final_rank = rank
        result.champion = (rank == 1)
        result.runner_up = (rank == 2)

    # Auto-awards
    if stats_sorted:
        # Champion
        champ_award = Award(
            season_id=season_id,
            name="Champion",
            description="Season Champion",
            is_auto_calculated=True,
            auto_calc_metric="win_percentage",
            recipient_team_id=stats_sorted[0].team_id,
        )
        db.add(champ_award)

        # Best record
        best_record = max(stats_list, key=lambda s: s.match_wins or 0, default=None)
        if best_record:
            db.add(Award(
                season_id=season_id,
                name="Best Record",
                is_auto_calculated=True,
                auto_calc_metric="match_wins",
                recipient_team_id=best_record.team_id,
            ))

        # Most kills
        most_kills = max(stats_list, key=lambda s: s.total_kills or 0, default=None)
        if most_kills and (most_kills.total_kills or 0) > 0:
            db.add(Award(
                season_id=season_id,
                name="Most Kills",
                is_auto_calculated=True,
                auto_calc_metric="total_kills",
                recipient_team_id=most_kills.team_id,
            ))

    season.status = "complete"
    db.commit()
    return {"message": "Season closed", "champion_team_id": stats_sorted[0].team_id if stats_sorted else None}


@router.get("/history")
def get_history(db: Session = Depends(get_db)):
    seasons = db.query(Season).filter(Season.status == "complete").all()
    result = []
    for s in seasons:
        champion = db.query(SeasonResult).filter(
            SeasonResult.season_id == s.id,
            SeasonResult.champion == True,
        ).first()
        champion_team = db.query(Team).filter(Team.id == champion.team_id).first() if champion else None
        result.append({
            "season_id": s.id,
            "name": s.name,
            "year": s.year,
            "format": s.format,
            "champion_team": champion_team.name if champion_team else None,
        })
    return result


@router.get("/history/{season_id}")
def get_season_history(season_id: int, db: Session = Depends(get_db)):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    results = db.query(SeasonResult).filter(SeasonResult.season_id == season_id).all()
    awards = db.query(Award).filter(Award.season_id == season_id).all()

    return {
        "season": {"id": season.id, "name": season.name, "year": season.year},
        "results": [{"team_id": r.team_id, "rank": r.final_rank, "champion": r.champion} for r in results],
        "awards": [{"name": a.name, "team_id": a.recipient_team_id} for a in awards],
    }


@router.get("/managers/{user_id}/career")
def get_manager_career(user_id: int, db: Session = Depends(get_db)):
    teams = db.query(Team).filter(Team.manager_id == user_id).all()
    if not teams:
        raise HTTPException(status_code=404, detail="No teams found for this manager")

    career = []
    for team in teams:
        result = db.query(SeasonResult).filter(
            SeasonResult.team_id == team.id
        ).first()
        stats = db.query(TeamSeasonStats).filter(
            TeamSeasonStats.team_id == team.id
        ).first()
        career.append({
            "team_id": team.id,
            "team_name": team.name,
            "season_id": team.season_id,
            "final_rank": result.final_rank if result else None,
            "champion": result.champion if result else False,
            "match_wins": stats.match_wins if stats else 0,
            "total_kills": stats.total_kills if stats else 0,
        })

    return {
        "user_id": user_id,
        "seasons": career,
        "total_seasons": len(career),
        "championships": sum(1 for c in career if c["champion"]),
    }


@router.post("/seasons/{season_id}/awards")
def create_award(
    season_id: int,
    data: AwardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    award = Award(
        season_id=season_id,
        name=data.name,
        description=data.description,
        is_auto_calculated=data.is_auto_calculated,
        auto_calc_metric=data.auto_calc_metric,
        recipient_team_id=data.recipient_team_id,
        recipient_notes=data.recipient_notes,
    )
    db.add(award)
    db.commit()
    db.refresh(award)
    return {"id": award.id, "name": award.name, "team_id": award.recipient_team_id}


@router.delete("/seasons/{season_id}/awards/{award_id}")
def delete_award(
    season_id: int,
    award_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    award = db.query(Award).filter(Award.id == award_id, Award.season_id == season_id).first()
    if not award:
        raise HTTPException(status_code=404, detail="Award not found")
    db.delete(award)
    db.commit()
    return {"ok": True}


@router.get("/awards")
def get_all_awards(db: Session = Depends(get_db)):
    awards = db.query(Award).order_by(Award.season_id.desc(), Award.awarded_at.desc()).all()
    result = []
    for a in awards:
        season = db.query(Season).filter(Season.id == a.season_id).first()
        team = db.query(Team).filter(Team.id == a.recipient_team_id).first() if a.recipient_team_id else None
        result.append({
            "id": a.id,
            "season_id": a.season_id,
            "season_name": season.name if season else f"Season {a.season_id}",
            "name": a.name,
            "description": a.description,
            "recipient_team_id": a.recipient_team_id,
            "recipient_team_name": team.name if team else None,
            "recipient_notes": a.recipient_notes,
            "is_auto_calculated": a.is_auto_calculated,
        })
    return result


@router.get("/records")
def get_records(db: Session = Depends(get_db)):
    records = {}

    # Most kills in a single season (Pokemon)
    top_pss = (
        db.query(PokemonSeasonStats)
        .order_by(PokemonSeasonStats.total_kills.desc())
        .first()
    )
    if top_pss and (top_pss.total_kills or 0) > 0:
        species = db.query(PokemonSpecies).filter(PokemonSpecies.id == top_pss.species_id).first()
        team = db.query(Team).filter(Team.id == top_pss.team_id).first()
        season = db.query(Season).filter(Season.id == top_pss.season_id).first()
        records["most_kills_season_pokemon"] = {
            "value": top_pss.total_kills,
            "species_name": species.name if species else None,
            "team_name": team.name if team else None,
            "season_name": season.name if season else None,
        }

    # Best win ratio in a season (team, min 3 games)
    top_tss = (
        db.query(TeamSeasonStats)
        .filter(TeamSeasonStats.match_wins + TeamSeasonStats.match_losses + TeamSeasonStats.match_draws >= 3)
        .order_by(TeamSeasonStats.win_percentage.desc())
        .first()
    )
    if top_tss:
        team = db.query(Team).filter(Team.id == top_tss.team_id).first()
        season = db.query(Season).filter(Season.id == top_tss.season_id).first()
        records["best_win_pct_season"] = {
            "value": round((top_tss.win_percentage or 0.0) * 100, 1),
            "record": f"{top_tss.match_wins}W-{top_tss.match_losses}L",
            "team_name": team.name if team else None,
            "season_name": season.name if season else None,
        }

    # Most kills in a single game (Pokemon)
    top_gs = (
        db.query(GameStat)
        .order_by((GameStat.direct_kills + GameStat.passive_kills).desc())
        .first()
    )
    if top_gs and (top_gs.direct_kills + top_gs.passive_kills) > 0:
        species = db.query(PokemonSpecies).filter(PokemonSpecies.id == top_gs.species_id).first()
        team = db.query(Team).filter(Team.id == top_gs.team_id).first()
        records["most_kills_single_game"] = {
            "value": top_gs.direct_kills + top_gs.passive_kills,
            "species_name": species.name if species else None,
            "team_name": team.name if team else None,
            "game_id": top_gs.game_id,
        }

    # Longest / shortest game by turn count
    turn_subq = (
        db.query(GameKillEvent.game_id, func.max(GameKillEvent.turn_number).label("max_turn"))
        .group_by(GameKillEvent.game_id)
        .subquery()
    )
    longest = db.query(turn_subq).order_by(turn_subq.c.max_turn.desc()).first()
    if longest:
        records["longest_game"] = {"value": longest.max_turn, "label": "turns", "game_id": longest.game_id}

    shortest = (
        db.query(turn_subq)
        .filter(turn_subq.c.max_turn >= 3)
        .order_by(turn_subq.c.max_turn.asc())
        .first()
    )
    if shortest:
        records["shortest_game"] = {"value": shortest.max_turn, "label": "turns", "game_id": shortest.game_id}

    return records

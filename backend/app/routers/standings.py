from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.stats import TeamSeasonStats, PokemonSeasonStats
from app.models.team import Team
from app.services.stats_service import sort_standings
from typing import List
from pydantic import BaseModel
from typing import Optional

router = APIRouter(tags=["standings"])


class StandingsOut(BaseModel):
    team_id: int
    team_name: str
    match_wins: int
    match_losses: int
    match_draws: int
    win_percentage: float
    game_differential: int
    match_differential: int
    total_kills: int
    total_deaths: int
    kill_death_differential: int
    streak: int
    rank: int

    model_config = {"from_attributes": True}


@router.get("/seasons/{season_id}/standings")
def get_standings(season_id: int, db: Session = Depends(get_db)):
    stats_list = db.query(TeamSeasonStats).filter(
        TeamSeasonStats.season_id == season_id
    ).all()

    # Eager load team names
    for s in stats_list:
        _ = s.team

    sorted_stats = sort_standings(stats_list)

    result = []
    for rank, s in enumerate(sorted_stats, start=1):
        result.append({
            "team_id": s.team_id,
            "team_name": s.team.name if s.team else "Unknown",
            "match_wins": s.match_wins or 0,
            "match_losses": s.match_losses or 0,
            "match_draws": s.match_draws or 0,
            "win_percentage": round(s.win_percentage or 0.0, 4),
            "game_differential": s.game_differential or 0,
            "match_differential": s.match_differential or 0,
            "total_kills": s.total_kills or 0,
            "total_deaths": s.total_deaths or 0,
            "kill_death_differential": s.kill_death_differential or 0,
            "streak": s.streak or 0,
            "rank": rank,
        })

    return result


@router.get("/seasons/{season_id}/pokemon-stats")
def get_pokemon_stats(season_id: int, db: Session = Depends(get_db)):
    stats = db.query(PokemonSeasonStats).filter(
        PokemonSeasonStats.season_id == season_id
    ).order_by(
        PokemonSeasonStats.total_kills.desc(),
        PokemonSeasonStats.kill_death_differential.desc(),
        PokemonSeasonStats.games_played.asc(),
    ).all()
    return stats

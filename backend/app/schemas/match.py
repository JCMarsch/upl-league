from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class MatchSubmit(BaseModel):
    home_games_won: int
    away_games_won: int
    notes: Optional[str] = None


class GameStatCreate(BaseModel):
    team_id: int
    species_id: int
    was_brought: bool = False
    was_lead: bool = False
    direct_kills: int = 0
    passive_kills: int = 0
    direct_deaths: int = 0
    passive_deaths: int = 0


class MatchOut(BaseModel):
    id: int
    season_id: int
    week_number: int
    home_team_id: int
    away_team_id: int
    home_games_won: int
    away_games_won: int
    winner_team_id: Optional[int]
    status: str

    model_config = {"from_attributes": True}


class ScheduleOut(BaseModel):
    id: int
    season_id: int
    week_number: int
    home_team_id: int
    away_team_id: int
    status: str

    model_config = {"from_attributes": True}

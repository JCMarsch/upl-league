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


class GameStatOut(BaseModel):
    id: int
    game_id: int
    team_id: int
    species_id: int
    was_brought: bool
    was_lead: bool
    direct_kills: int
    passive_kills: int
    direct_deaths: int
    passive_deaths: int

    model_config = {"from_attributes": True}


class GameCreate(BaseModel):
    game_number: int
    winner_team_id: Optional[int] = None
    loser_team_id: Optional[int] = None
    replay_url: Optional[str] = None
    replay_source: Optional[str] = None


class ReplayParseRequest(BaseModel):
    replay_url: str


class KillEventCreate(BaseModel):
    turn_number: int
    attacker_team_id: int
    attacker_species_id: int
    defender_team_id: int
    defender_species_id: int
    move_name: Optional[str] = None
    kill_type: str = "direct"


class KillEventOut(BaseModel):
    id: int
    game_id: int
    turn_number: int
    attacker_team_id: int
    attacker_species_id: int
    defender_team_id: int
    defender_species_id: int
    move_name: Optional[str]
    kill_type: str

    model_config = {"from_attributes": True}


class GameOut(BaseModel):
    id: int
    match_id: int
    game_number: int
    winner_team_id: Optional[int]
    loser_team_id: Optional[int]
    replay_url: Optional[str]
    replay_source: Optional[str]
    replay_parsed: bool
    stats: List[GameStatOut] = []
    kill_events: List[KillEventOut] = []

    model_config = {"from_attributes": True}


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
    match_id: Optional[int] = None
    home_games_won: int = 0
    away_games_won: int = 0
    match_status: Optional[str] = None
    winner_team_id: Optional[int] = None

    model_config = {"from_attributes": True}

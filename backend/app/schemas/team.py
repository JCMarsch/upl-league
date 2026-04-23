from pydantic import BaseModel
from typing import Optional, List


class RosterPokemonUpdate(BaseModel):
    nickname: Optional[str] = None
    ability: Optional[str] = None
    item: Optional[str] = None
    move1: Optional[str] = None
    move2: Optional[str] = None
    move3: Optional[str] = None
    move4: Optional[str] = None
    tera_type: Optional[str] = None
    notes: Optional[str] = None


class RosterPokemonOut(BaseModel):
    id: int
    team_id: int
    season_pokemon_id: int
    nickname: Optional[str]
    ability: Optional[str]
    item: Optional[str]
    move1: Optional[str]
    move2: Optional[str]
    move3: Optional[str]
    move4: Optional[str]
    tera_type: Optional[str]
    is_active: bool
    # Species info
    species_name: Optional[str] = None
    species_sprite_url: Optional[str] = None
    species_artwork_url: Optional[str] = None
    species_type1: Optional[str] = None
    species_type2: Optional[str] = None
    # Season info
    tier: Optional[str] = None
    point_cost: Optional[int] = None
    draft_pick_number: Optional[int] = None
    # Base stats
    hp: Optional[int] = None
    atk: Optional[int] = None
    def_: Optional[int] = None
    spatk: Optional[int] = None
    spdef: Optional[int] = None
    spe: Optional[int] = None
    total: Optional[int] = None
    # Game stats
    gp: int = 0
    gw: int = 0
    direct_kills: int = 0
    passive_kills: int = 0
    total_kills: int = 0
    direct_deaths: int = 0
    passive_deaths: int = 0
    total_deaths: int = 0
    kd_diff: int = 0
    games_brought: int = 0
    games_led: int = 0

    model_config = {"from_attributes": True}


class TeamDetailOut(BaseModel):
    id: int
    season_id: int
    manager_id: int
    name: str
    abbreviation: Optional[str]
    logo_url: Optional[str]
    primary_color: str
    secondary_color: str
    points_remaining: int
    roster: List[RosterPokemonOut] = []
    # Season record
    match_wins: int = 0
    match_losses: int = 0
    match_draws: int = 0
    win_percentage: float = 0.0
    streak: int = 0
    game_differential: int = 0
    total_kills: int = 0
    total_deaths: int = 0
    kd_differential: int = 0

    model_config = {"from_attributes": True}

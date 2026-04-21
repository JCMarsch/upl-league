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
    species_name: Optional[str] = None
    species_sprite_url: Optional[str] = None
    species_type1: Optional[str] = None
    species_type2: Optional[str] = None
    tier: Optional[str] = None
    point_cost: Optional[int] = None

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

    model_config = {"from_attributes": True}

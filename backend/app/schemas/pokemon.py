from pydantic import BaseModel
from typing import Optional, List


class SeasonPokemonUpdate(BaseModel):
    species_id: int
    tier: Optional[str] = None
    point_cost: Optional[int] = None
    is_legal: Optional[bool] = None


class BulkPokemonUpdate(BaseModel):
    updates: List[SeasonPokemonUpdate]


class SeasonPokemonOut(BaseModel):
    id: int
    season_id: int
    species_id: int
    tier: Optional[str]
    point_cost: Optional[int]
    is_legal: bool
    drafted_by_team_id: Optional[int]
    species_name: Optional[str] = None
    species_sprite_url: Optional[str] = None
    species_type1: Optional[str] = None
    species_type2: Optional[str] = None

    model_config = {"from_attributes": True}

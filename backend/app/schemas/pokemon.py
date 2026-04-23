from pydantic import BaseModel
from typing import Optional, List


class SeasonPokemonUpdate(BaseModel):
    species_id: int
    tier: Optional[str] = None
    point_cost: Optional[int] = None
    is_legal: Optional[bool] = None

    model_config = {"from_attributes": True}


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
    species_forme_name: Optional[str] = None
    species_sprite_url: Optional[str] = None
    species_artwork_url: Optional[str] = None
    species_shiny_sprite_url: Optional[str] = None
    species_shiny_artwork_url: Optional[str] = None
    species_type1: Optional[str] = None
    species_type2: Optional[str] = None
    is_mega: Optional[bool] = None
    is_regional_variant: Optional[bool] = None
    format_legality: Optional[dict] = None
    pokedex_number: Optional[int] = None
    hp: Optional[int] = None
    atk: Optional[int] = None
    def_: Optional[int] = None
    spatk: Optional[int] = None
    spdef: Optional[int] = None
    spe: Optional[int] = None
    total: Optional[int] = None
    # Aggregated game stats for the season
    stat_games_played: Optional[int] = None
    stat_games_won: Optional[int] = None
    stat_games_brought: Optional[int] = None
    stat_games_led: Optional[int] = None
    stat_direct_kills: Optional[int] = None
    stat_passive_kills: Optional[int] = None
    stat_total_kills: Optional[int] = None
    stat_direct_deaths: Optional[int] = None
    stat_passive_deaths: Optional[int] = None
    stat_total_deaths: Optional[int] = None
    stat_kd_diff: Optional[int] = None

    model_config = {"from_attributes": True}

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DraftPickCreate(BaseModel):
    season_pokemon_id: int


class DraftPickOut(BaseModel):
    id: int
    pick_number: int
    round_number: int
    team_id: int
    season_pokemon_id: int
    picked_at: datetime

    model_config = {"from_attributes": True}


class DraftStateOut(BaseModel):
    id: int
    season_id: int
    status: str
    current_pick_number: int
    current_team_id: Optional[int]
    timer_seconds: Optional[int]
    pick_started_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PickConfirmedOut(BaseModel):
    """Response from POST /pick — everything the frontend needs to update locally."""
    pick: DraftPickOut
    state: DraftStateOut
    drafted_pokemon_id: int
    team_id: int
    points_remaining: int

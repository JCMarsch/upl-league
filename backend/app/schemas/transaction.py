from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class WaiverCreate(BaseModel):
    add_species_id: int
    drop_species_id: Optional[int] = None


class WaiverOut(BaseModel):
    id: int
    season_id: int
    week_number: int
    team_id: int
    add_species_id: int
    drop_species_id: Optional[int]
    priority_at_time: Optional[int]
    status: str
    submitted_at: datetime

    model_config = {"from_attributes": True}


class TradeCreate(BaseModel):
    proposed_to_team_id: int
    give_species_ids: List[int]  # species IDs from proposing team
    receive_species_ids: List[int]  # species IDs from other team
    notes: Optional[str] = None


class TradeVoteCreate(BaseModel):
    vote: str  # approve / deny


class TradeOut(BaseModel):
    id: int
    season_id: int
    proposed_by_team_id: int
    proposed_to_team_id: int
    status: str
    proposed_at: datetime

    model_config = {"from_attributes": True}

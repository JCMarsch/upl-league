from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class SeasonCreate(BaseModel):
    name: str
    format: str = "VGC"
    year: int
    draft_type: str = "snake"
    draft_timer_seconds: Optional[int] = None
    points_budget: int = 100
    roster_size: int = 10
    free_pick_slots: int = 0
    required_slots: Dict[str, Any] = {}
    series_format: str = "bo3"
    match_format: str = "round_robin"
    playoff_format: Dict[str, Any] = {}
    keeper_enabled: bool = False
    language: str = "en"


class SeasonUpdate(BaseModel):
    name: Optional[str] = None
    format: Optional[str] = None
    draft_type: Optional[str] = None
    draft_timer_seconds: Optional[int] = None
    points_budget: Optional[int] = None
    roster_size: Optional[int] = None
    free_pick_slots: Optional[int] = None
    required_slots: Optional[Dict[str, Any]] = None
    series_format: Optional[str] = None
    keeper_enabled: Optional[bool] = None


class SeasonOut(BaseModel):
    id: int
    name: str
    format: str
    year: int
    status: str
    draft_type: str
    draft_timer_seconds: Optional[int]
    points_budget: int
    roster_size: int
    required_slots: Dict[str, Any]
    series_format: str
    keeper_enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TeamCreate(BaseModel):
    name: str
    abbreviation: Optional[str] = None
    manager_id: int
    logo_url: Optional[str] = None
    primary_color: str = "#1a1a2e"
    secondary_color: str = "#ffffff"


class TeamOut(BaseModel):
    id: int
    season_id: int
    manager_id: int
    name: str
    abbreviation: Optional[str]
    logo_url: Optional[str]
    primary_color: str
    secondary_color: str
    points_remaining: int

    model_config = {"from_attributes": True}

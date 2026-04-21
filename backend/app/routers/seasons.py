from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import require_admin, get_current_user
from app.models.season import Season
from app.models.team import Team
from app.models.user import User
from app.schemas.season import SeasonCreate, SeasonUpdate, SeasonOut, TeamCreate, TeamOut
from typing import List

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.post("", response_model=SeasonOut, status_code=201)
def create_season(
    data: SeasonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = Season(**data.model_dump())
    db.add(season)
    db.commit()
    db.refresh(season)
    return season


@router.get("", response_model=List[SeasonOut])
def list_seasons(db: Session = Depends(get_db)):
    return db.query(Season).all()


@router.get("/{season_id}", response_model=SeasonOut)
def get_season(season_id: int, db: Session = Depends(get_db)):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return season


@router.patch("/{season_id}", response_model=SeasonOut)
def update_season(
    season_id: int,
    data: SeasonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != "setup":
        raise HTTPException(status_code=403, detail="Cannot edit season after setup phase")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(season, field, value)
    db.commit()
    db.refresh(season)
    return season


@router.post("/{season_id}/teams", response_model=TeamOut, status_code=201)
def create_team(
    season_id: int,
    data: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    existing = db.query(Team).filter(
        Team.season_id == season_id,
        Team.manager_id == data.manager_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Manager already has a team in this season")

    team = Team(
        season_id=season_id,
        points_remaining=season.points_budget,
        **data.model_dump(),
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.get("/{season_id}/teams", response_model=List[TeamOut])
def list_teams(season_id: int, db: Session = Depends(get_db)):
    return db.query(Team).filter(Team.season_id == season_id).all()

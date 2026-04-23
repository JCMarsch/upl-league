from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime, timezone
from typing import List, Dict
import json

from app.database import get_db
from app.auth import require_admin, get_current_user
from app.models.season import Season
from app.models.team import Team
from app.models.draft import Draft, DraftOrder
from app.models.pokemon import SeasonPokemon, RosterPokemon
from app.models.user import User
from app.schemas.draft import DraftPickCreate, DraftPickOut, DraftStateOut
from app.services import draft_service

router = APIRouter(prefix="/draft", tags=["draft"])

# In-memory WebSocket connection pool
_connections: Dict[int, List[WebSocket]] = {}


async def broadcast(season_id: int, message: dict):
    if season_id in _connections:
        dead = []
        for ws in _connections[season_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            _connections[season_id].remove(ws)


@router.post("/{season_id}/start", response_model=DraftStateOut)
def start_draft(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != "draft":
        raise HTTPException(status_code=400, detail="Tiers must be locked before starting draft")

    existing = db.query(Draft).filter(Draft.season_id == season_id).first()
    if existing and existing.status == "active":
        raise HTTPException(status_code=400, detail="Draft already active")

    teams = db.query(Team).filter(Team.season_id == season_id).all()
    team_ids = [t.id for t in teams]
    if not team_ids:
        raise HTTPException(status_code=400, detail="No teams in season")

    if not existing:
        draft = Draft(
            season_id=season_id,
            status="active",
            current_pick_number=1,
            timer_seconds=season.draft_timer_seconds,
        )
        db.add(draft)
        db.flush()

        # Generate snake order
        total_picks = len(team_ids) * season.roster_size
        num_rounds = season.roster_size
        for entry in draft_service.generate_snake_order(team_ids, num_rounds):
            order = DraftOrder(draft_id=draft.id, **entry)
            db.add(order)
    else:
        draft = existing
        draft.status = "active"

    draft.current_team_id = draft_service.get_next_team_snake(
        draft, team_ids, draft.current_pick_number, len(team_ids)
    )
    draft.pick_started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(draft)
    return draft


@router.post("/{season_id}/pick", response_model=DraftPickOut)
def make_pick(
    season_id: int,
    data: DraftPickCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    draft = db.query(Draft).filter(Draft.season_id == season_id).first()
    if not draft or draft.status != "active":
        raise HTTPException(status_code=400, detail="Draft is not active")

    # Verify it's the user's turn
    team = db.query(Team).filter(
        Team.season_id == season_id,
        Team.manager_id == current_user.id,
    ).first()

    is_admin = any(r in current_user.roles.split(",") for r in ["admin", "superadmin"])
    if not is_admin and (not team or team.id != draft.current_team_id):
        raise HTTPException(status_code=403, detail="It is not your turn to pick")

    if is_admin and not team:
        team = db.query(Team).filter(Team.id == draft.current_team_id).first()

    # Validate the pokemon
    sp = db.query(SeasonPokemon).filter(
        SeasonPokemon.id == data.season_pokemon_id,
        SeasonPokemon.season_id == season_id,
    ).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Pokemon not in this season")
    if not sp.is_legal:
        raise HTTPException(status_code=400, detail="Pokemon is not legal in this season")
    if sp.drafted_by_team_id is not None:
        raise HTTPException(status_code=400, detail="Pokemon already drafted")

    # Check budget
    picking_team = db.query(Team).filter(Team.id == draft.current_team_id).first()
    if (sp.point_cost or 0) > picking_team.points_remaining:
        raise HTTPException(status_code=400, detail="Insufficient points budget")

    team_ids = [
        t.id for t in db.query(Team).filter(Team.season_id == season_id).order_by(Team.id).all()
    ]

    pick = draft_service.make_pick(db, draft, draft.current_team_id, sp.id, season, team_ids)

    # Add to roster
    roster_entry = RosterPokemon(team_id=pick.team_id, season_pokemon_id=sp.id)
    db.add(roster_entry)
    db.commit()

    return pick


@router.post("/{season_id}/pause")
def pause_draft(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    draft = db.query(Draft).filter(Draft.season_id == season_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    draft.status = "paused"
    db.commit()
    return {"status": "paused"}


@router.post("/{season_id}/resume")
def resume_draft(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    draft = db.query(Draft).filter(Draft.season_id == season_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    draft.status = "active"
    draft.pick_started_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "active"}


@router.get("/{season_id}/state", response_model=DraftStateOut)
def get_draft_state(season_id: int, db: Session = Depends(get_db)):
    draft = db.query(Draft).filter(Draft.season_id == season_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.get("/{season_id}/board")
def get_draft_board(season_id: int, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    picks = (
        db.query(SeasonPokemon)
        .options(
            joinedload(SeasonPokemon.species),
            joinedload(SeasonPokemon.drafted_by_team),
        )
        .filter(
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.drafted_by_team_id.isnot(None),
        )
        .order_by(SeasonPokemon.draft_pick_number)
        .all()
    )
    return [
        {
            "pick_number": sp.draft_pick_number,
            "team_id": sp.drafted_by_team_id,
            "team_name": sp.drafted_by_team.name if sp.drafted_by_team else None,
            "team_abbreviation": sp.drafted_by_team.abbreviation if sp.drafted_by_team else None,
            "team_primary_color": sp.drafted_by_team.primary_color if sp.drafted_by_team else "#888",
            "team_secondary_color": sp.drafted_by_team.secondary_color if sp.drafted_by_team else "#888",
            "tier": sp.tier,
            "point_cost": sp.point_cost,
            "species_id": sp.species_id,
            "species_name": sp.species.name if sp.species else None,
            "species_sprite_url": sp.species.sprite_url if sp.species else None,
            "species_type1": sp.species.type1 if sp.species else None,
            "species_type2": sp.species.type2 if sp.species else None,
        }
        for sp in picks
    ]


@router.websocket("/ws/{season_id}")
async def draft_websocket(websocket: WebSocket, season_id: int):
    await websocket.accept()
    if season_id not in _connections:
        _connections[season_id] = []
    _connections[season_id].append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            await broadcast(season_id, msg)
    except WebSocketDisconnect:
        _connections[season_id].remove(websocket)

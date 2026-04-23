from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.auth import get_current_user, require_admin
from app.models.season import Season
from app.models.team import Team
from app.models.pokemon import SeasonPokemon, RosterPokemon
from app.models.transaction import Waiver, WaiverOrder, Trade, TradeAsset, TradeVote
from app.models.user import User
from app.schemas.transaction import WaiverCreate, WaiverOut, TradeCreate, TradeVoteCreate, TradeOut
from typing import List

router = APIRouter(tags=["transactions"])


def get_team_for_user(db: Session, user: User, season_id: int) -> Team:
    team = db.query(Team).filter(
        Team.season_id == season_id, Team.manager_id == user.id
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="You don't have a team in this season")
    return team


# ===== WAIVERS =====

@router.post("/seasons/{season_id}/waivers", response_model=WaiverOut, status_code=201)
def submit_waiver(
    season_id: int,
    data: WaiverCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = get_team_for_user(db, current_user, season_id)

    # Check the pokemon to add is available
    sp = db.query(SeasonPokemon).filter(
        SeasonPokemon.season_id == season_id,
        SeasonPokemon.species_id == data.add_species_id,
    ).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Pokemon not in this season")
    if sp.drafted_by_team_id is not None:
        raise HTTPException(status_code=400, detail="Pokemon already drafted")

    # Get current waiver position
    order = db.query(WaiverOrder).filter(
        WaiverOrder.season_id == season_id,
        WaiverOrder.team_id == team.id,
    ).order_by(WaiverOrder.week_number.desc()).first()
    priority = order.priority_position if order else 999

    waiver = Waiver(
        season_id=season_id,
        week_number=1,  # simplified - would be current week
        team_id=team.id,
        add_species_id=data.add_species_id,
        drop_species_id=data.drop_species_id,
        priority_at_time=priority,
        status="pending",
    )
    db.add(waiver)
    db.commit()
    db.refresh(waiver)
    return waiver


@router.get("/seasons/{season_id}/waivers", response_model=List[WaiverOut])
def list_waivers(season_id: int, db: Session = Depends(get_db)):
    return db.query(Waiver).filter(Waiver.season_id == season_id).all()


@router.post("/seasons/{season_id}/waivers/{waiver_id}/process")
def process_waiver(
    season_id: int,
    waiver_id: int,
    approve: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    waiver = db.query(Waiver).filter(
        Waiver.id == waiver_id, Waiver.season_id == season_id
    ).first()
    if not waiver:
        raise HTTPException(status_code=404, detail="Waiver not found")

    if approve:
        # Check budget - simplified
        team = db.query(Team).filter(Team.id == waiver.team_id).first()
        sp_add = db.query(SeasonPokemon).filter(
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.species_id == waiver.add_species_id,
        ).first()
        if sp_add and (sp_add.point_cost or 0) > team.points_remaining:
            raise HTTPException(status_code=400, detail="Insufficient points budget")

        # Process the add
        if sp_add:
            sp_add.drafted_by_team_id = team.id
            sp_add.acquired_via = "waiver"
            rp = RosterPokemon(team_id=team.id, season_pokemon_id=sp_add.id)
            db.add(rp)
            team.points_remaining -= sp_add.point_cost or 0

        # Process the drop
        if waiver.drop_species_id:
            sp_drop = db.query(SeasonPokemon).filter(
                SeasonPokemon.season_id == season_id,
                SeasonPokemon.species_id == waiver.drop_species_id,
                SeasonPokemon.drafted_by_team_id == team.id,
            ).first()
            if sp_drop:
                sp_drop.drafted_by_team_id = None
                sp_drop.acquired_via = None
                db.query(RosterPokemon).filter(
                    RosterPokemon.team_id == team.id,
                    RosterPokemon.season_pokemon_id == sp_drop.id,
                ).delete()
                team.points_remaining += sp_drop.point_cost or 0

        waiver.status = "approved"
    else:
        waiver.status = "denied"

    waiver.processed_at = datetime.now(timezone.utc)
    waiver.processed_by_id = current_user.id
    db.commit()
    return {"status": waiver.status}


@router.get("/seasons/{season_id}/waiver-order")
def get_waiver_order(season_id: int, db: Session = Depends(get_db)):
    order = db.query(WaiverOrder).filter(
        WaiverOrder.season_id == season_id
    ).order_by(WaiverOrder.priority_position).all()
    return [{"team_id": o.team_id, "position": o.priority_position} for o in order]


# ===== TRADES =====

@router.post("/seasons/{season_id}/trades", response_model=TradeOut, status_code=201)
def propose_trade(
    season_id: int,
    data: TradeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    proposing_team = get_team_for_user(db, current_user, season_id)

    trade = Trade(
        season_id=season_id,
        proposed_by_team_id=proposing_team.id,
        proposed_to_team_id=data.proposed_to_team_id,
        status="pending",
        notes=data.notes,
    )
    db.add(trade)
    db.flush()

    # Add assets - what proposing team gives
    for species_id in data.give_species_ids:
        sp = db.query(SeasonPokemon).filter(
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.species_id == species_id,
            SeasonPokemon.drafted_by_team_id == proposing_team.id,
        ).first()
        if not sp:
            raise HTTPException(status_code=400, detail=f"Species {species_id} not on your team")
        asset = TradeAsset(
            trade_id=trade.id,
            from_team_id=proposing_team.id,
            to_team_id=data.proposed_to_team_id,
            season_pokemon_id=sp.id,
        )
        db.add(asset)

    # Add assets - what proposing team receives
    for species_id in data.receive_species_ids:
        sp = db.query(SeasonPokemon).filter(
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.species_id == species_id,
            SeasonPokemon.drafted_by_team_id == data.proposed_to_team_id,
        ).first()
        if not sp:
            raise HTTPException(status_code=400, detail=f"Species {species_id} not on opponent's team")
        asset = TradeAsset(
            trade_id=trade.id,
            from_team_id=data.proposed_to_team_id,
            to_team_id=proposing_team.id,
            season_pokemon_id=sp.id,
        )
        db.add(asset)

    db.commit()
    db.refresh(trade)
    return trade


@router.get("/seasons/{season_id}/trades", response_model=List[TradeOut])
def list_trades(season_id: int, db: Session = Depends(get_db)):
    return db.query(Trade).filter(Trade.season_id == season_id).all()


@router.post("/trades/{trade_id}/vote")
def vote_on_trade(
    trade_id: int,
    data: TradeVoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    # Get the voting team
    team = db.query(Team).filter(
        Team.season_id == trade.season_id,
        Team.manager_id == current_user.id,
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="No team found for this season")

    # Check: one vote per team
    existing = db.query(TradeVote).filter(
        TradeVote.trade_id == trade_id,
        TradeVote.team_id == team.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already voted on this trade")

    if data.vote not in ["approve", "deny"]:
        raise HTTPException(status_code=422, detail="Vote must be approve or deny")

    vote = TradeVote(trade_id=trade_id, team_id=team.id, vote=data.vote)
    db.add(vote)
    trade.status = "voting"

    # Check if majority reached
    all_teams = db.query(Team).filter(Team.season_id == trade.season_id).count()
    votes = db.query(TradeVote).filter(TradeVote.trade_id == trade_id).count()
    approvals = db.query(TradeVote).filter(
        TradeVote.trade_id == trade_id, TradeVote.vote == "approve"
    ).count()
    denials = db.query(TradeVote).filter(
        TradeVote.trade_id == trade_id, TradeVote.vote == "deny"
    ).count()

    majority = all_teams // 2 + 1
    db.flush()
    current_approvals = approvals + (1 if data.vote == "approve" else 0)
    current_denials = denials + (1 if data.vote == "deny" else 0)

    if current_approvals >= majority:
        trade.status = "approved"
        trade.approved_at = datetime.now(timezone.utc)
    elif current_denials >= majority:
        trade.status = "denied"

    db.commit()
    return {"status": trade.status, "vote": data.vote}


@router.post("/trades/{trade_id}/confirm")
def confirm_trade(
    trade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    # Execute the trade
    for asset in trade.assets:
        sp = asset.season_pokemon
        sp.drafted_by_team_id = asset.to_team_id
        sp.acquired_via = "trade"

        # Update roster
        db.query(RosterPokemon).filter(
            RosterPokemon.season_pokemon_id == sp.id
        ).update({"team_id": asset.to_team_id})

    trade.status = "approved"
    trade.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "approved"}


@router.post("/trades/{trade_id}/cancel")
def cancel_trade(
    trade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    team = db.query(Team).filter(
        Team.season_id == trade.season_id,
        Team.manager_id == current_user.id,
    ).first()

    is_admin = any(r in current_user.roles.split(",") for r in ["admin", "superadmin"])
    if not is_admin and (not team or team.id != trade.proposed_by_team_id):
        raise HTTPException(status_code=403, detail="Only proposing team can cancel")

    if trade.status not in ["pending", "voting"]:
        raise HTTPException(status_code=400, detail="Trade cannot be cancelled in current state")

    trade.status = "cancelled"
    db.commit()
    return {"status": "cancelled"}


@router.get("/seasons/{season_id}/transaction-feed")
def transaction_feed(season_id: int, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload

    waivers = (
        db.query(Waiver)
        .options(
            joinedload(Waiver.team),
            joinedload(Waiver.add_species),
            joinedload(Waiver.drop_species),
        )
        .filter(Waiver.season_id == season_id, Waiver.status == "approved")
        .all()
    )

    trades = (
        db.query(Trade)
        .options(
            joinedload(Trade.proposed_by_team),
            joinedload(Trade.proposed_to_team),
            joinedload(Trade.assets).joinedload(TradeAsset.season_pokemon).joinedload(SeasonPokemon.species),
        )
        .filter(Trade.season_id == season_id, Trade.status == "executed")
        .all()
    )

    entries = []

    for w in waivers:
        entries.append({
            "type": "waiver",
            "date": (w.processed_at or w.submitted_at).isoformat() if (w.processed_at or w.submitted_at) else None,
            "week_number": w.week_number,
            "team_id": w.team_id,
            "team_name": w.team.name if w.team else None,
            "team_abbreviation": w.team.abbreviation if w.team else None,
            "add_species_name": w.add_species.name if w.add_species else None,
            "drop_species_name": w.drop_species.name if w.drop_species else None,
        })

    for t in trades:
        assets_out = []
        for a in t.assets:
            sp = a.season_pokemon
            assets_out.append({
                "from_team_id": a.from_team_id,
                "to_team_id": a.to_team_id,
                "species_name": sp.species.name if sp and sp.species else None,
            })
        entries.append({
            "type": "trade",
            "date": (t.resolved_at or t.approved_at or t.proposed_at).isoformat() if (t.resolved_at or t.approved_at or t.proposed_at) else None,
            "team_a_id": t.proposed_by_team_id,
            "team_a_name": t.proposed_by_team.name if t.proposed_by_team else None,
            "team_a_abbreviation": t.proposed_by_team.abbreviation if t.proposed_by_team else None,
            "team_b_id": t.proposed_to_team_id,
            "team_b_name": t.proposed_to_team.name if t.proposed_to_team else None,
            "team_b_abbreviation": t.proposed_to_team.abbreviation if t.proposed_to_team else None,
            "assets": assets_out,
        })

    entries.sort(key=lambda e: e.get("date") or "", reverse=True)
    return entries

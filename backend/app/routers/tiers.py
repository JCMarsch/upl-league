from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone
from app.database import get_db
from app.auth import require_admin
from app.models.season import Season
from app.models.pokemon import SeasonPokemon, PokemonSpecies
from app.models.user import User
from app.schemas.pokemon import BulkPokemonUpdate, SeasonPokemonOut
from typing import List

router = APIRouter(tags=["tiers"])


@router.get("/seasons/{season_id}/pokemon", response_model=List[SeasonPokemonOut])
def list_season_pokemon(season_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(SeasonPokemon)
        .filter(SeasonPokemon.season_id == season_id)
        .options(joinedload(SeasonPokemon.species))
        .order_by(SeasonPokemon.species_id)
        .all()
    )
    return [
        SeasonPokemonOut(
            id=sp.id,
            season_id=sp.season_id,
            species_id=sp.species_id,
            tier=sp.tier,
            point_cost=sp.point_cost,
            is_legal=sp.is_legal,
            drafted_by_team_id=sp.drafted_by_team_id,
            species_name=sp.species.name if sp.species else None,
            species_sprite_url=sp.species.sprite_url if sp.species else None,
            species_type1=sp.species.type1 if sp.species else None,
            species_type2=sp.species.type2 if sp.species else None,
        )
        for sp in rows
    ]


@router.post("/seasons/{season_id}/pokemon/populate")
def populate_season_pokemon(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    all_species = db.query(PokemonSpecies).all()
    existing_ids = {sp.species_id for sp in db.query(SeasonPokemon).filter(SeasonPokemon.season_id == season_id).all()}

    created = 0
    for species in all_species:
        if species.id not in existing_ids:
            db.add(SeasonPokemon(season_id=season_id, species_id=species.id, is_legal=True))
            created += 1

    db.commit()
    return {"created": created, "total": len(all_species)}


@router.post("/seasons/{season_id}/pokemon/bulk-update")
def bulk_update_pokemon(
    season_id: int,
    data: BulkPokemonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != "setup":
        raise HTTPException(status_code=403, detail="Tiers can only be edited during setup")

    updated = []
    for update in data.updates:
        sp = db.query(SeasonPokemon).filter(
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.species_id == update.species_id,
        ).first()
        if not sp:
            # Create if doesn't exist
            sp = SeasonPokemon(season_id=season_id, species_id=update.species_id)
            db.add(sp)
        if update.tier is not None:
            sp.tier = update.tier
        if update.point_cost is not None:
            sp.point_cost = update.point_cost
        if update.is_legal is not None:
            sp.is_legal = update.is_legal
        updated.append(update.species_id)

    db.commit()
    return {"updated": len(updated), "species_ids": updated}


@router.post("/seasons/{season_id}/lock-tiers")
def lock_tiers(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != "setup":
        raise HTTPException(status_code=400, detail="Season is not in setup status")

    # Check for any legal pokemon missing tier assignments
    missing = db.query(SeasonPokemon).filter(
        SeasonPokemon.season_id == season_id,
        SeasonPokemon.is_legal == True,
        SeasonPokemon.tier == None,
    ).count()
    if missing > 0:
        raise HTTPException(
            status_code=400,
            detail=f"{missing} legal Pokemon are missing tier assignments",
        )

    now = datetime.now(timezone.utc)
    db.query(SeasonPokemon).filter(SeasonPokemon.season_id == season_id).update(
        {"locked_at": now}
    )
    season.status = "draft"
    db.commit()
    return {"message": "Tiers locked", "season_status": season.status}

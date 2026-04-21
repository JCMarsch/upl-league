from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user, require_admin
from app.models.team import Team
from app.models.pokemon import RosterPokemon
from app.models.user import User
from app.schemas.team import TeamDetailOut, RosterPokemonOut, RosterPokemonUpdate
from typing import List

router = APIRouter(prefix="/teams", tags=["teams"])


def build_roster_out(rp: RosterPokemon) -> RosterPokemonOut:
    sp = rp.season_pokemon
    species = sp.species if sp else None
    return RosterPokemonOut(
        id=rp.id,
        team_id=rp.team_id,
        season_pokemon_id=rp.season_pokemon_id,
        nickname=rp.nickname,
        ability=rp.ability,
        item=rp.item,
        move1=rp.move1,
        move2=rp.move2,
        move3=rp.move3,
        move4=rp.move4,
        tera_type=rp.tera_type,
        is_active=rp.is_active,
        species_name=species.name if species else None,
        species_sprite_url=species.sprite_url if species else None,
        species_type1=species.type1 if species else None,
        species_type2=species.type2 if species else None,
        tier=sp.tier if sp else None,
        point_cost=sp.point_cost if sp else None,
    )


@router.get("/{team_id}", response_model=TeamDetailOut)
def get_team(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    roster = [build_roster_out(rp) for rp in team.roster if rp.is_active]

    return TeamDetailOut(
        id=team.id,
        season_id=team.season_id,
        manager_id=team.manager_id,
        name=team.name,
        abbreviation=team.abbreviation,
        logo_url=team.logo_url,
        primary_color=team.primary_color,
        secondary_color=team.secondary_color,
        points_remaining=team.points_remaining,
        roster=roster,
    )


@router.patch("/{team_id}/pokemon/{roster_id}", response_model=RosterPokemonOut)
def update_roster_pokemon(
    team_id: int,
    roster_id: int,
    data: RosterPokemonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    is_admin = any(r in current_user.roles.split(",") for r in ["admin", "superadmin"])
    is_manager = team.manager_id == current_user.id

    if not is_admin and not is_manager:
        raise HTTPException(status_code=403, detail="Not authorized to edit this team")

    rp = db.query(RosterPokemon).filter(
        RosterPokemon.id == roster_id,
        RosterPokemon.team_id == team_id,
    ).first()
    if not rp:
        raise HTTPException(status_code=404, detail="Roster entry not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(rp, field, value)
    db.commit()
    db.refresh(rp)

    return build_roster_out(rp)

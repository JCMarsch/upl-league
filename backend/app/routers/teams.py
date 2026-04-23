from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.auth import get_current_user
from app.models.team import Team
from app.models.pokemon import RosterPokemon
from app.models.stats import PokemonSeasonStats, TeamSeasonStats
from app.models.user import User
from app.schemas.team import TeamDetailOut, RosterPokemonOut, RosterPokemonUpdate
from typing import List

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("/{team_id}", response_model=TeamDetailOut)
def get_team(team_id: int, db: Session = Depends(get_db)):
    team = (
        db.query(Team)
        .options(
            joinedload(Team.roster)
            .joinedload(RosterPokemon.season_pokemon)
        )
        .filter(Team.id == team_id)
        .first()
    )
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    active_roster = [rp for rp in team.roster if rp.is_active]

    # Batch fetch game stats for all species on this team
    species_ids = [
        rp.season_pokemon.species_id
        for rp in active_roster
        if rp.season_pokemon and rp.season_pokemon.species_id
    ]
    gs_map: dict = {}
    if species_ids:
        rows = db.query(PokemonSeasonStats).filter(
            PokemonSeasonStats.team_id == team_id,
            PokemonSeasonStats.species_id.in_(species_ids),
        ).all()
        gs_map = {r.species_id: r for r in rows}

    roster_out = []
    for rp in active_roster:
        sp = rp.season_pokemon
        species = sp.species if sp else None
        gs = gs_map.get(species.id) if species else None

        roster_out.append(RosterPokemonOut(
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
            species_id=species.id if species else None,
            species_name=species.name if species else None,
            species_sprite_url=species.sprite_url if species else None,
            species_artwork_url=species.artwork_url if species else None,
            species_type1=species.type1 if species else None,
            species_type2=species.type2 if species else None,
            tier=sp.tier if sp else None,
            point_cost=sp.point_cost if sp else None,
            draft_pick_number=sp.draft_pick_number if sp else None,
            hp=species.hp if species else None,
            atk=species.atk if species else None,
            def_=getattr(species, "def_", None) if species else None,
            spatk=species.spatk if species else None,
            spdef=species.spdef if species else None,
            spe=species.spe if species else None,
            total=species.total if species else None,
            gp=gs.games_played if gs else 0,
            gw=gs.games_won if gs else 0,
            direct_kills=gs.direct_kills if gs else 0,
            passive_kills=gs.passive_kills if gs else 0,
            total_kills=gs.total_kills if gs else 0,
            direct_deaths=gs.direct_deaths if gs else 0,
            passive_deaths=gs.passive_deaths if gs else 0,
            total_deaths=gs.total_deaths if gs else 0,
            kd_diff=gs.kill_death_differential if gs else 0,
            games_brought=gs.games_brought if gs else 0,
            games_led=gs.games_led if gs else 0,
        ))

    # Team season record
    ts = db.query(TeamSeasonStats).filter(
        TeamSeasonStats.team_id == team_id,
        TeamSeasonStats.season_id == team.season_id,
    ).first()

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
        roster=roster_out,
        match_wins=ts.match_wins if ts else 0,
        match_losses=ts.match_losses if ts else 0,
        match_draws=ts.match_draws if ts else 0,
        win_percentage=round(ts.win_percentage or 0.0, 3) if ts else 0.0,
        streak=ts.streak if ts else 0,
        game_differential=ts.game_differential if ts else 0,
        total_kills=ts.total_kills if ts else 0,
        total_deaths=ts.total_deaths if ts else 0,
        kd_differential=ts.kill_death_differential if ts else 0,
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

    rp = (
        db.query(RosterPokemon)
        .options(joinedload(RosterPokemon.season_pokemon))
        .filter(RosterPokemon.id == roster_id, RosterPokemon.team_id == team_id)
        .first()
    )
    if not rp:
        raise HTTPException(status_code=404, detail="Roster entry not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(rp, field, value)
    db.commit()
    db.refresh(rp)

    sp = rp.season_pokemon
    species = sp.species if sp else None
    gs = db.query(PokemonSeasonStats).filter(
        PokemonSeasonStats.team_id == team_id,
        PokemonSeasonStats.species_id == (species.id if species else -1),
    ).first()

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
        species_artwork_url=species.artwork_url if species else None,
        species_type1=species.type1 if species else None,
        species_type2=species.type2 if species else None,
        tier=sp.tier if sp else None,
        point_cost=sp.point_cost if sp else None,
        draft_pick_number=sp.draft_pick_number if sp else None,
        hp=species.hp if species else None,
        atk=species.atk if species else None,
        def_=getattr(species, "def_", None) if species else None,
        spatk=species.spatk if species else None,
        spdef=species.spdef if species else None,
        spe=species.spe if species else None,
        total=species.total if species else None,
        gp=gs.games_played if gs else 0,
        gw=gs.games_won if gs else 0,
        direct_kills=gs.direct_kills if gs else 0,
        passive_kills=gs.passive_kills if gs else 0,
        total_kills=gs.total_kills if gs else 0,
        direct_deaths=gs.direct_deaths if gs else 0,
        passive_deaths=gs.passive_deaths if gs else 0,
        total_deaths=gs.total_deaths if gs else 0,
        kd_diff=gs.kill_death_differential if gs else 0,
        games_brought=gs.games_brought if gs else 0,
        games_led=gs.games_led if gs else 0,
    )

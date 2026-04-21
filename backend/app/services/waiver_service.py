from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.transaction import Waiver, RosterPokemon
from app.models.pokemon import SeasonPokemon, RosterPokemon
from app.models.team import Team


def run_waiver_processing(db: Session, season_id: int, processed_by_id: int = None) -> int:
    """Process all pending waivers for a season in priority order. Returns count processed."""
    pending = (
        db.query(Waiver)
        .filter(Waiver.season_id == season_id, Waiver.status == "pending")
        .order_by(Waiver.priority_at_time.asc(), Waiver.submitted_at.asc())
        .all()
    )

    processed = 0
    claimed_species: set[int] = set()

    for waiver in pending:
        # Skip if another higher-priority waiver already claimed this pokemon
        if waiver.add_species_id in claimed_species:
            waiver.status = "denied"
            waiver.processed_at = datetime.now(timezone.utc)
            waiver.processed_by_id = processed_by_id
            db.flush()
            continue

        team = db.query(Team).filter(Team.id == waiver.team_id).first()
        sp_add = db.query(SeasonPokemon).filter(
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.species_id == waiver.add_species_id,
        ).first()

        if not sp_add or sp_add.drafted_by_team_id is not None:
            waiver.status = "denied"
        elif (sp_add.point_cost or 0) > (team.points_remaining or 0):
            waiver.status = "denied"
        else:
            # Approve
            sp_add.drafted_by_team_id = team.id
            sp_add.acquired_via = "waiver"
            db.add(RosterPokemon(team_id=team.id, season_pokemon_id=sp_add.id))
            team.points_remaining -= sp_add.point_cost or 0
            claimed_species.add(waiver.add_species_id)

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

        waiver.processed_at = datetime.now(timezone.utc)
        waiver.processed_by_id = processed_by_id
        processed += 1
        db.flush()

    db.commit()
    return processed

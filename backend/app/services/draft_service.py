"""Draft state machine service."""
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.draft import Draft, DraftOrder, DraftPick
from app.models.team import Team
from app.models.pokemon import SeasonPokemon
from app.models.season import Season


def generate_snake_order(team_ids: List[int], num_rounds: int) -> List[dict]:
    """Generate snake draft order for all rounds."""
    order = []
    for round_num in range(1, num_rounds + 1):
        teams_this_round = team_ids if round_num % 2 == 1 else list(reversed(team_ids))
        for pos, team_id in enumerate(teams_this_round, start=1):
            order.append({
                "round_number": round_num,
                "pick_position": pos,
                "team_id": team_id,
            })
    return order


def get_next_team_snake(
    draft: Draft,
    team_ids: List[int],
    current_pick_number: int,
    num_teams: int,
) -> int:
    """Return the team_id that should pick at current_pick_number."""
    pick_index = current_pick_number - 1
    round_num = pick_index // num_teams + 1
    pos_in_round = pick_index % num_teams
    if round_num % 2 == 1:
        return team_ids[pos_in_round]
    else:
        return team_ids[num_teams - 1 - pos_in_round]


def get_highest_tier_available(db: Session, season_id: int) -> Optional[SeasonPokemon]:
    """For autopick: select highest-tier available pokemon."""
    tier_order = ["S", "A", "B", "C", "D", "Free"]
    for tier in tier_order:
        sp = db.query(SeasonPokemon).filter(
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.tier == tier,
            SeasonPokemon.is_legal == True,
            SeasonPokemon.drafted_by_team_id == None,
        ).first()
        if sp:
            return sp
    # Fallback: any available
    return db.query(SeasonPokemon).filter(
        SeasonPokemon.season_id == season_id,
        SeasonPokemon.is_legal == True,
        SeasonPokemon.drafted_by_team_id == None,
    ).first()


def make_pick(
    db: Session,
    draft: Draft,
    team_id: int,
    season_pokemon_id: int,
    season: Season,
    team_ids: List[int],
) -> DraftPick:
    """Record a draft pick and advance state."""
    num_teams = len(team_ids)
    pick_num = draft.current_pick_number
    round_num = (pick_num - 1) // num_teams + 1

    # Record pick
    pick = DraftPick(
        draft_id=draft.id,
        pick_number=pick_num,
        round_number=round_num,
        team_id=team_id,
        season_pokemon_id=season_pokemon_id,
    )
    db.add(pick)

    # Mark pokemon as drafted
    sp = db.query(SeasonPokemon).filter(SeasonPokemon.id == season_pokemon_id).first()
    sp.drafted_by_team_id = team_id
    sp.draft_pick_number = pick_num
    sp.acquired_via = "draft"

    # Deduct points
    team = db.query(Team).filter(Team.id == team_id).first()
    team.points_remaining -= sp.point_cost or 0

    # Advance pick number
    draft.current_pick_number = pick_num + 1

    # Set next team
    next_pick = pick_num + 1
    total_picks = num_teams * season.roster_size
    if next_pick <= total_picks:
        draft.current_team_id = get_next_team_snake(draft, team_ids, next_pick, num_teams)
    else:
        draft.status = "complete"
        draft.current_team_id = None

    db.commit()
    db.refresh(pick)
    return pick

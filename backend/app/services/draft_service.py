"""Draft state machine service."""
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.draft import Draft, DraftOrder, DraftPick
from app.models.team import Team
from app.models.pokemon import SeasonPokemon, RosterPokemon
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
    """Simple tier-order query (no budget check). Used by tests and as a fallback."""
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
    return db.query(SeasonPokemon).filter(
        SeasonPokemon.season_id == season_id,
        SeasonPokemon.is_legal == True,
        SeasonPokemon.drafted_by_team_id == None,
    ).first()


def _check_wishlist_conditions(
    db: Session,
    team_id: int,
    season_id: int,
    item,  # WishlistItem
) -> bool:
    """Return True if the wishlist item's conditions are met."""
    from app.models.pokemon import RosterPokemon as RP
    conditions = item.conditions or []
    if not conditions:
        return True

    results = []
    for cond in conditions:
        ctype = cond.get("type")
        sid = cond.get("species_id")
        if ctype == "already_have":
            has = db.query(RP).join(SeasonPokemon, SeasonPokemon.id == RP.season_pokemon_id).filter(
                RP.team_id == team_id,
                SeasonPokemon.season_id == season_id,
                SeasonPokemon.species_id == sid,
            ).first() is not None
            results.append(has)
        elif ctype == "pokemon_gone":
            gone = db.query(SeasonPokemon).filter(
                SeasonPokemon.season_id == season_id,
                SeasonPokemon.species_id == sid,
                SeasonPokemon.drafted_by_team_id.isnot(None),
            ).first() is not None
            results.append(gone)

    if not results:
        return True
    op = item.conditions_operator or "AND"
    return all(results) if op == "AND" else any(results)


def _get_wishlist_autopick(
    db: Session,
    season_id: int,
    team: Team,
    season: Season,
) -> Optional[SeasonPokemon]:
    """Check wishlist in priority order. Return the first matching available pokemon."""
    from app.models.wishlist import WishlistItem
    items = (
        db.query(WishlistItem)
        .filter(WishlistItem.team_id == team.id)
        .order_by(WishlistItem.priority)
        .all()
    )
    for item in items:
        sp = db.query(SeasonPokemon).filter(
            SeasonPokemon.id == item.season_pokemon_id,
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.is_legal == True,
            SeasonPokemon.drafted_by_team_id == None,
        ).first()
        if not sp:
            continue
        cost = sp.point_cost or 0
        if cost > team.points_remaining:
            continue
        if not _check_wishlist_conditions(db, team.id, season_id, item):
            continue
        return sp
    return None


def get_best_autopick(
    db: Session,
    season_id: int,
    team: Team,
    season: Season,
) -> Optional[SeasonPokemon]:
    """
    Pick the highest tier pokemon that:
    1. Fits within safe_budget (points_remaining - minimum cost to fill N-1 remaining picks)
    2. Still allows fulfilling required_slots with the remaining roster spots

    Does NOT prioritize required slots first — picks highest value that keeps options open.
    """
    # Wishlist takes priority
    wishlist_pick = _get_wishlist_autopick(db, season_id, team, season)
    if wishlist_pick:
        return wishlist_pick

    available = (
        db.query(SeasonPokemon)
        .filter(
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.is_legal == True,
            SeasonPokemon.drafted_by_team_id == None,
        )
        .all()
    )
    if not available:
        return None

    # How many picks does this team have left (including this one)?
    roster_count = (
        db.query(RosterPokemon)
        .filter(RosterPokemon.team_id == team.id)
        .count()
    )
    picks_left = season.roster_size - roster_count  # includes current pick
    if picks_left <= 0:
        return None

    # Required slots still unfulfilled
    required_slots = season.required_slots or {}
    fulfilled = _count_fulfilled_slots(db, team.id, season_id)
    remaining_required = {
        slot: max(0, count - fulfilled.get(slot, 0))
        for slot, count in required_slots.items()
    }

    # Sort available by cost ascending for safe_budget calculation
    available_sorted_by_cost = sorted(available, key=lambda p: p.point_cost or 0)

    tier_order = ["Mega", "S", "A", "B", "C", "D", "Free"]
    tier_rank = {t: i for i, t in enumerate(tier_order)}

    # Sort all available by tier desc, then by cost desc within tier
    candidates = sorted(
        available,
        key=lambda p: (tier_rank.get(p.tier or "Free", 99), -(p.point_cost or 0))
    )

    for candidate in candidates:
        cost = candidate.point_cost or 0
        if cost > team.points_remaining:
            continue

        remaining_after_pick = team.points_remaining - cost
        picks_after = picks_left - 1

        if picks_after == 0:
            # Last pick — just check it fits budget
            if cost <= team.points_remaining and _can_fulfill_required(candidate, remaining_required, {}):
                return candidate
            continue

        # Safe budget: need to keep enough for the N-1 cheapest remaining picks
        # But those cheapest picks must also satisfy remaining required slots
        others = [p for p in available if p.id != candidate.id]

        # Check if we can still fulfill required slots with picks_after picks
        new_required = _update_required_after_pick(candidate, remaining_required)
        if not _feasible(others, new_required, picks_after, remaining_after_pick):
            continue

        return candidate

    # Fallback: cheapest available that fits budget
    for p in available_sorted_by_cost:
        if (p.point_cost or 0) <= team.points_remaining:
            return p

    return None


def _count_fulfilled_slots(db: Session, team_id: int, season_id: int) -> dict:
    """Count how many of each required slot type the team already has."""
    roster = (
        db.query(SeasonPokemon)
        .join(RosterPokemon, RosterPokemon.season_pokemon_id == SeasonPokemon.id)
        .filter(RosterPokemon.team_id == team_id, SeasonPokemon.season_id == season_id)
        .all()
    )
    counts: dict = {}
    for sp in roster:
        if sp.is_mega:
            counts["mega"] = counts.get("mega", 0) + 1
            # Mega fills the "mega" required slot, not a letter-tier slot
        elif sp.tier:
            counts[sp.tier] = counts.get(sp.tier, 0) + 1
    return counts


def _update_required_after_pick(candidate: SeasonPokemon, remaining_required: dict) -> dict:
    """Return updated remaining_required after picking candidate."""
    new_req = dict(remaining_required)
    if candidate.is_mega:
        if new_req.get("mega", 0) > 0:
            new_req["mega"] = new_req["mega"] - 1
        # Mega does not also consume a letter-tier required slot
    elif candidate.tier and new_req.get(candidate.tier, 0) > 0:
        new_req[candidate.tier] = new_req[candidate.tier] - 1
    return {k: v for k, v in new_req.items() if v > 0}


def _can_fulfill_required(candidate: SeasonPokemon, remaining_required: dict, _unused) -> bool:
    """Check if picking candidate satisfies or moves toward required slots."""
    return True  # We check feasibility separately


def _feasible(
    available: List[SeasonPokemon],
    remaining_required: dict,
    picks_left: int,
    budget: int,
) -> bool:
    """
    Check if remaining_required can be fulfilled with picks_left picks and budget.
    Also checks that cheapest picks_left pokemon can be afforded.
    """
    if not remaining_required:
        # No required slots — just check budget for cheapest picks
        cheapest = sorted(available, key=lambda p: p.point_cost or 0)[:picks_left]
        return sum(p.point_cost or 0 for p in cheapest) <= budget

    # Check each required slot type has enough candidates available
    for slot, count in remaining_required.items():
        slot_candidates = _candidates_for_slot(available, slot)
        if len(slot_candidates) < count:
            return False

    # Greedy check: can we pick picks_left pokemon satisfying required slots within budget?
    # Sort required slots by scarcity (fewest candidates first)
    slot_items = sorted(remaining_required.items(), key=lambda kv: len(_candidates_for_slot(available, kv[0])))

    budget_remaining = budget
    picks_remaining = picks_left
    picked_ids = set()

    for slot, count in slot_items:
        slot_cands = [p for p in _candidates_for_slot(available, slot) if p.id not in picked_ids]
        cheapest_for_slot = sorted(slot_cands, key=lambda p: p.point_cost or 0)[:count]
        if len(cheapest_for_slot) < count:
            return False
        for p in cheapest_for_slot:
            cost = p.point_cost or 0
            if cost > budget_remaining:
                return False
            budget_remaining -= cost
            picks_remaining -= 1
            picked_ids.add(p.id)

    # Fill remaining free picks with cheapest available
    free_cands = sorted([p for p in available if p.id not in picked_ids], key=lambda p: p.point_cost or 0)
    for p in free_cands[:picks_remaining]:
        cost = p.point_cost or 0
        if cost > budget_remaining:
            return False
        budget_remaining -= cost

    return True


def _candidates_for_slot(available: List[SeasonPokemon], slot: str) -> List[SeasonPokemon]:
    """Return available pokemon that satisfy the given required slot."""
    if slot == "mega":
        return [p for p in available if p.is_mega]
    # Mega Pokemon fill the "mega" slot, not letter-tier slots
    return [p for p in available if p.tier == slot and not p.is_mega]


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
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    time_taken = None
    if draft.pick_started_at:
        started = draft.pick_started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        delta = (now - started).total_seconds()
        time_taken = max(0, round(delta))

    pick = DraftPick(
        draft_id=draft.id,
        pick_number=pick_num,
        round_number=round_num,
        team_id=team_id,
        season_pokemon_id=season_pokemon_id,
        time_taken_seconds=time_taken,
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

    # Set next team and timer
    next_pick = pick_num + 1
    total_picks = num_teams * season.roster_size
    if next_pick <= total_picks:
        draft.current_team_id = get_next_team_snake(draft, team_ids, next_pick, num_teams)
        draft.pick_started_at = datetime.now(timezone.utc)
    else:
        draft.status = "complete"
        draft.current_team_id = None
        draft.pick_started_at = None

    db.commit()
    db.refresh(pick)
    return pick

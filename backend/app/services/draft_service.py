"""Draft state machine service."""
from typing import List, Optional, Set
from sqlalchemy.orm import Session, joinedload
from app.models.draft import Draft, DraftOrder, DraftPick
from app.models.team import Team
from app.models.pokemon import SeasonPokemon, RosterPokemon
from app.models.season import Season

import logging as _logging
_log = _logging.getLogger(__name__)

# Structural slot definitions — fixed for UPL rules.
# 1 Mega + 5 tier picks (S/A/B/C/D) + 4 free picks = 10 total.
_REQUIRED_TIERS = ['S', 'A', 'B', 'C', 'D']
_FREE_SLOTS = 4


def _is_mega(sp: SeasonPokemon) -> bool:
    return bool(sp.species and sp.species.is_mega)


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


# ---------------------------------------------------------------------------
# Roster state helpers
# ---------------------------------------------------------------------------

def _load_roster(db: Session, team_id: int, season_id: int) -> List[SeasonPokemon]:
    """Return current drafted SeasonPokemon for this team, with species loaded."""
    return (
        db.query(SeasonPokemon)
        .join(RosterPokemon, RosterPokemon.season_pokemon_id == SeasonPokemon.id)
        .filter(RosterPokemon.team_id == team_id, SeasonPokemon.season_id == season_id)
        .options(joinedload(SeasonPokemon.species))
        .all()
    )


def _roster_state(roster: List[SeasonPokemon]):
    """
    Compute slot assignment for a roster list.
    Returns:
        mega_filled: bool
        required_filled: set of tier strings already occupying their required slot
        free_used: number of free-slot picks used
    """
    mega_filled = False
    required_filled: Set[str] = set()
    free_used = 0

    for sp in roster:
        if _is_mega(sp):
            # Only the first mega fills the mega slot; a 2nd would also count as free
            # but should never happen — we prevent it at pick time.
            mega_filled = True
        elif sp.tier in _REQUIRED_TIERS and sp.tier not in required_filled:
            required_filled.add(sp.tier)
        else:
            free_used += 1

    return mega_filled, required_filled, free_used


def _slots_summary(team_id, season_id, db):
    roster = _load_roster(db, team_id, season_id)
    mega_filled, required_filled, free_used = _roster_state(roster)
    _log.info(
        f"slots team={team_id}: mega={'Y' if mega_filled else 'N'} "
        f"required={sorted(required_filled)} free_used={free_used}/{_FREE_SLOTS}"
    )
    return mega_filled, required_filled, free_used


# ---------------------------------------------------------------------------
# Wishlist autopick
# ---------------------------------------------------------------------------

def _check_wishlist_conditions(db: Session, team_id: int, season_id: int, item) -> bool:
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
    mega_filled: bool,
    required_filled: Set[str],
    free_used: int,
    total_picks: int,
) -> Optional[SeasonPokemon]:
    from app.models.wishlist import WishlistItem
    roster_size = season.roster_size or 10
    picks_left = roster_size - total_picks  # includes current pick

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
        ).options(joinedload(SeasonPokemon.species)).first()
        if not sp:
            continue
        if not _pick_is_legal(sp, mega_filled, required_filled, free_used, picks_left, roster_size):
            _log.info(f"  wishlist sp={sp.id} blocked by slot rules")
            continue
        cost = sp.point_cost or 0
        if cost > team.points_remaining:
            _log.info(f"  wishlist sp={sp.id} too expensive cost={cost}")
            continue
        if not _check_wishlist_conditions(db, team.id, season_id, item):
            _log.info(f"  wishlist sp={sp.id} conditions not met")
            continue
        _log.info(f"  wishlist sp={sp.id} tier={sp.tier} is_mega={_is_mega(sp)} SELECTED")
        return sp
    return None


# ---------------------------------------------------------------------------
# Pick legality check (structural, independent of config)
# ---------------------------------------------------------------------------

def _pick_is_legal(
    sp: SeasonPokemon,
    mega_filled: bool,
    required_filled: Set[str],
    free_used: int,
    picks_left: int,  # including this pick
    roster_size: int = 10,
) -> bool:
    """
    Return True if picking sp is structurally legal given current roster state.
    - Exactly 1 mega slot. A 2nd mega is never legal.
    - S/A/B/C/D: fills required slot if unfilled, else goes to free slot.
    - Free-tier always goes to free slot.
    - Can't use more free slots than available (_FREE_SLOTS).
    - Must keep enough picks to fill unfilled required slots.
    """
    if _is_mega(sp):
        return not mega_filled  # Hard stop: only 1 mega allowed

    unfilled_required = set(_REQUIRED_TIERS) - required_filled
    # How many required slots remain after this pick?
    tier = sp.tier
    fills_required_slot = (tier in unfilled_required)

    if fills_required_slot:
        unfilled_after = unfilled_required - {tier}
    else:
        unfilled_after = unfilled_required
        # This pick goes to a free slot
        free_after = free_used + 1
        if free_after > _FREE_SLOTS:
            return False  # No free slots left
        # Check we still have enough picks left to fill remaining required slots
        # picks_left - 1 (this pick) must be >= unfilled_after + (0 or 1 for mega)
        remaining_picks = picks_left - 1
        needs = len(unfilled_after) + (0 if mega_filled else 1)
        if remaining_picks < needs:
            return False  # Can't fill required slots

    return True


# ---------------------------------------------------------------------------
# Best autopick
# ---------------------------------------------------------------------------

def get_best_autopick(
    db: Session,
    season_id: int,
    team: Team,
    season: Season,
) -> Optional[SeasonPokemon]:
    """
    Pick the highest-value pokemon that:
    1. Is structurally legal (slot rules)
    2. Fits within budget
    3. Still allows completing required slots within remaining budget
    """
    roster = _load_roster(db, team.id, season_id)
    mega_filled, required_filled, free_used = _roster_state(roster)
    roster_size = season.roster_size or 10
    total_picks = len(roster)
    picks_left = roster_size - total_picks  # includes current pick

    _log.info(
        f"get_best_autopick team={team.id} pts={team.points_remaining} picks_left={picks_left} "
        f"mega={'Y' if mega_filled else 'N'} required={sorted(required_filled)} free_used={free_used}"
    )

    if picks_left <= 0:
        return None

    # Try wishlist first
    wishlist_pick = _get_wishlist_autopick(
        db, season_id, team, season, mega_filled, required_filled, free_used, total_picks
    )
    if wishlist_pick:
        return wishlist_pick

    # Load all available pokemon with species
    available = (
        db.query(SeasonPokemon)
        .filter(
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.is_legal == True,
            SeasonPokemon.drafted_by_team_id == None,
        )
        .options(joinedload(SeasonPokemon.species))
        .all()
    )
    if not available:
        return None

    tier_rank = {"Mega": 0, "S": 1, "A": 2, "B": 3, "C": 4, "D": 5, "Free": 6}

    # Sort candidates: megas first (tier_rank 0), then by tier, then by cost desc
    candidates = sorted(
        available,
        key=lambda p: (tier_rank.get(p.tier or "Free", 6) if not _is_mega(p) else 0, -(p.point_cost or 0))
    )

    for candidate in candidates:
        cost = candidate.point_cost or 0
        if cost > team.points_remaining:
            continue

        if not _pick_is_legal(candidate, mega_filled, required_filled, free_used, picks_left, roster_size):
            continue

        remaining_pts = team.points_remaining - cost
        remaining_picks = picks_left - 1

        if remaining_picks == 0:
            return candidate  # Last pick, already passed legality check

        # Compute what slots will still be unfilled after this pick
        if _is_mega(candidate):
            mega_after = True
            req_after = required_filled
        elif candidate.tier in _REQUIRED_TIERS and candidate.tier not in required_filled:
            mega_after = mega_filled
            req_after = required_filled | {candidate.tier}
        else:
            mega_after = mega_filled
            req_after = required_filled

        # Check we can still afford remaining required slots
        others = [p for p in available if p.id != candidate.id]
        if not _can_complete(others, mega_after, req_after, remaining_picks, remaining_pts):
            continue

        return candidate

    # Fallback: cheapest legal pick within budget
    cheapest = sorted(available, key=lambda p: p.point_cost or 0)
    for p in cheapest:
        if (p.point_cost or 0) <= team.points_remaining:
            if _pick_is_legal(p, mega_filled, required_filled, free_used, picks_left, roster_size):
                return p

    return None


def _can_complete(
    available: List[SeasonPokemon],
    mega_filled: bool,
    required_filled: Set[str],
    picks_remaining: int,
    budget: int,
) -> bool:
    """
    Check if the remaining required slots can be filled with picks_remaining picks
    and the given budget.
    """
    unfilled = set(_REQUIRED_TIERS) - required_filled
    needed = list(unfilled) + ([] if mega_filled else ['mega'])

    if picks_remaining < len(needed):
        return False  # Not enough picks to fill required slots

    total_min_cost = 0
    used_ids: set = set()

    # For each required slot, find cheapest available pokemon that can fill it
    for slot in needed:
        if slot == 'mega':
            candidates = [p for p in available if _is_mega(p) and p.id not in used_ids]
        else:
            candidates = [p for p in available if not _is_mega(p) and p.tier == slot and p.id not in used_ids]
        if not candidates:
            return False  # No pokemon available for this required slot
        cheapest = min(candidates, key=lambda p: p.point_cost or 0)
        cost = cheapest.point_cost or 0
        if total_min_cost + cost > budget:
            return False
        total_min_cost += cost
        used_ids.add(cheapest.id)

    # Remaining free picks: check we can afford the cheapest available
    free_picks = picks_remaining - len(needed)
    if free_picks > 0:
        free_candidates = sorted(
            [p for p in available if p.id not in used_ids and (p.point_cost or 0) >= 0],
            key=lambda p: p.point_cost or 0
        )
        for p in free_candidates[:free_picks]:
            c = p.point_cost or 0
            if total_min_cost + c > budget:
                return False  # Can't afford even the cheapest free picks
            total_min_cost += c

    return True


# ---------------------------------------------------------------------------
# make_pick
# ---------------------------------------------------------------------------

def make_pick(
    db: Session,
    draft: Draft,
    team_id: int,
    season_pokemon_id: int,
    season: Season,
    team_ids: List[int],
) -> DraftPick:
    """Record a draft pick and advance state."""
    from app.models.pokemon import PokemonSpecies
    from datetime import datetime, timezone

    num_teams = len(team_ids)
    pick_num = draft.current_pick_number
    round_num = (pick_num - 1) // num_teams + 1

    sp = db.query(SeasonPokemon).options(joinedload(SeasonPokemon.species)).filter(
        SeasonPokemon.id == season_pokemon_id
    ).first()

    # Hard-coded mega cap: load roster and validate structural legality
    roster = _load_roster(db, team_id, season.id)
    mega_filled, required_filled, free_used = _roster_state(roster)
    roster_size = season.roster_size or 10
    picks_left = roster_size - len(roster)  # includes this pick

    if not _pick_is_legal(sp, mega_filled, required_filled, free_used, picks_left, roster_size):
        if _is_mega(sp) and mega_filled:
            raise ValueError("Mega slot already filled (max 1 mega per team)")
        raise ValueError("Pick violates slot rules (no free slots remaining or required slots can't be completed)")

    # Record pick timing
    now = datetime.now(timezone.utc)
    time_taken = None
    if draft.pick_started_at:
        started = draft.pick_started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        time_taken = max(0, round((now - started).total_seconds()))

    pick = DraftPick(
        draft_id=draft.id,
        pick_number=pick_num,
        round_number=round_num,
        team_id=team_id,
        season_pokemon_id=season_pokemon_id,
        time_taken_seconds=time_taken,
    )
    db.add(pick)

    sp.drafted_by_team_id = team_id
    sp.draft_pick_number = pick_num
    sp.acquired_via = "draft"

    team = db.query(Team).filter(Team.id == team_id).first()
    team.points_remaining -= sp.point_cost or 0

    from app.models.pokemon import RosterPokemon as _RP
    db.add(_RP(team_id=team_id, season_pokemon_id=season_pokemon_id))

    draft.current_pick_number = pick_num + 1

    next_pick = pick_num + 1
    total_picks = num_teams * (season.roster_size or 10)
    if next_pick <= total_picks:
        draft.current_team_id = get_next_team_snake(draft, team_ids, next_pick, num_teams)
        draft.pick_started_at = datetime.now(timezone.utc)
    else:
        draft.status = "complete"
        draft.current_team_id = None
        draft.pick_started_at = None

    db.commit()
    db.refresh(pick)
    db.refresh(team)
    return pick


# ---------------------------------------------------------------------------
# Legacy helpers kept for compatibility
# ---------------------------------------------------------------------------

def _count_fulfilled_slots(db: Session, team_id: int, season_id: int) -> dict:
    roster = _load_roster(db, team_id, season_id)
    mega_filled, required_filled, _ = _roster_state(roster)
    counts = {}
    if mega_filled:
        counts['mega'] = 1
    for t in required_filled:
        counts[t] = 1
    return counts

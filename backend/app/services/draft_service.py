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
# 1 Mega + 5 tier picks (S/A/B/C/D) = 6 required.
# Remaining picks up to roster_size are free (any non-mega).
_REQUIRED_TIERS = ['S', 'A', 'B', 'C', 'D']
_REQUIRED_SLOTS = 6  # 1 mega + 5 tiers


def _free_slots(roster_size: int) -> int:
    return max(0, roster_size - _REQUIRED_SLOTS)


def _is_mega(sp: SeasonPokemon) -> bool:
    return bool(sp.species and sp.species.is_mega)


def generate_snake_order(team_ids: List[int], num_rounds: int) -> List[dict]:
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
    pick_index = current_pick_number - 1
    round_num = pick_index // num_teams + 1
    pos_in_round = pick_index % num_teams
    if round_num % 2 == 1:
        return team_ids[pos_in_round]
    else:
        return team_ids[num_teams - 1 - pos_in_round]


def get_highest_tier_available(db: Session, season_id: int) -> Optional[SeasonPokemon]:
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
    return (
        db.query(SeasonPokemon)
        .join(RosterPokemon, RosterPokemon.season_pokemon_id == SeasonPokemon.id)
        .filter(RosterPokemon.team_id == team_id, SeasonPokemon.season_id == season_id)
        .options(joinedload(SeasonPokemon.species))
        .all()
    )


def _roster_state(roster: List[SeasonPokemon]):
    """
    Returns:
        mega_filled: bool
        required_filled: set of tier strings filling their required slot
        free_used: number of picks using free slots
    """
    mega_filled = False
    required_filled: Set[str] = set()
    free_used = 0

    for sp in roster:
        if _is_mega(sp):
            mega_filled = True
        elif sp.tier in _REQUIRED_TIERS and sp.tier not in required_filled:
            required_filled.add(sp.tier)
        else:
            free_used += 1

    return mega_filled, required_filled, free_used


# ---------------------------------------------------------------------------
# Pick legality check (structural, independent of config)
# ---------------------------------------------------------------------------

def _pick_is_legal(
    sp: SeasonPokemon,
    mega_filled: bool,
    required_filled: Set[str],
    free_used: int,
    picks_left: int,
    roster_size: int = 10,
) -> bool:
    """
    Return True if picking sp is structurally legal.
    - Exactly 1 mega slot per team.
    - S/A/B/C/D: fills required slot if unfilled, else uses a free slot.
    - Free-tier always uses a free slot.
    - free picks capped at roster_size - 6.
    - Must keep enough picks to fill remaining required slots.
    """
    max_free = _free_slots(roster_size)

    if _is_mega(sp):
        return not mega_filled

    unfilled_required = set(_REQUIRED_TIERS) - required_filled
    tier = sp.tier
    fills_required = tier in unfilled_required

    if fills_required:
        # Fills a required slot — always legal if budget allows (checked by caller)
        return True
    else:
        # Goes to a free slot
        free_after = free_used + 1
        if free_after > max_free:
            return False
        # Must still have enough remaining picks to fill all unfilled required slots
        remaining_picks = picks_left - 1
        needs = len(unfilled_required) + (0 if mega_filled else 1)
        if remaining_picks < needs:
            return False
        return True


# ---------------------------------------------------------------------------
# Best autopick (no wishlist — picks highest available legal pokemon)
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
    3. Leaves enough budget to complete remaining required slots
    """
    roster = _load_roster(db, team.id, season.id)
    mega_filled, required_filled, free_used = _roster_state(roster)
    roster_size = season.roster_size or 10
    total = len(roster)
    picks_left = roster_size - total  # includes current pick

    _log.info(
        f"autopick team={team.id} pts={team.points_remaining} picks_left={picks_left} "
        f"mega={'Y' if mega_filled else 'N'} req={sorted(required_filled)} free={free_used}/{_free_slots(roster_size)}"
    )

    if picks_left <= 0:
        return None

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

    # Sort: megas first, then by tier rank, then cost descending within tier
    tier_rank = {"S": 1, "A": 2, "B": 3, "C": 4, "D": 5, "Free": 6}
    candidates = sorted(
        available,
        key=lambda p: (0 if _is_mega(p) else tier_rank.get(p.tier or "Free", 6), -(p.point_cost or 0))
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
            return candidate

        # Project slot state after this pick
        if _is_mega(candidate):
            mega_after, req_after = True, required_filled
        elif candidate.tier in _REQUIRED_TIERS and candidate.tier not in required_filled:
            mega_after, req_after = mega_filled, required_filled | {candidate.tier}
        else:
            mega_after, req_after = mega_filled, required_filled

        others = [p for p in available if p.id != candidate.id]
        if not _can_complete(others, mega_after, req_after, remaining_picks, remaining_pts, roster_size):
            continue

        return candidate

    # Fallback: cheapest structurally-legal pick
    for p in sorted(available, key=lambda p: p.point_cost or 0):
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
    roster_size: int = 10,
) -> bool:
    unfilled = set(_REQUIRED_TIERS) - required_filled
    # Mega goes first: it's a refund (negative cost), so evaluating it first avoids
    # false-negative budget failures when expensive required tiers are checked before
    # the mega's budget boost is applied.
    needed = ([] if mega_filled else ['mega']) + sorted(unfilled)

    if picks_remaining < len(needed):
        return False

    total_min_cost = 0
    used_ids: set = set()

    for slot in needed:
        if slot == 'mega':
            slot_candidates = [p for p in available if _is_mega(p) and p.id not in used_ids]
        else:
            slot_candidates = [p for p in available if not _is_mega(p) and p.tier == slot and p.id not in used_ids]
        if not slot_candidates:
            return False
        cheapest = min(slot_candidates, key=lambda p: p.point_cost or 0)
        cost = cheapest.point_cost or 0
        if total_min_cost + cost > budget:
            return False
        total_min_cost += cost
        used_ids.add(cheapest.id)

    # Check remaining free picks can be afforded
    free_picks = picks_remaining - len(needed)
    if free_picks > 0:
        free_cands = sorted(
            [p for p in available if p.id not in used_ids and (p.point_cost or 0) >= 0],
            key=lambda p: p.point_cost or 0
        )
        if len(free_cands) < free_picks:
            return False
        for p in free_cands[:free_picks]:
            c = p.point_cost or 0
            if total_min_cost + c > budget:
                return False
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
    from datetime import datetime, timezone

    num_teams = len(team_ids)
    pick_num = draft.current_pick_number
    round_num = (pick_num - 1) // num_teams + 1
    roster_size = season.roster_size or 10

    sp = db.query(SeasonPokemon).options(joinedload(SeasonPokemon.species)).filter(
        SeasonPokemon.id == season_pokemon_id
    ).first()

    roster = _load_roster(db, team_id, season.id)
    mega_filled, required_filled, free_used = _roster_state(roster)
    picks_left = roster_size - len(roster)

    if not _pick_is_legal(sp, mega_filled, required_filled, free_used, picks_left, roster_size):
        if _is_mega(sp) and mega_filled:
            raise ValueError("Mega slot already filled (max 1 mega per team)")
        raise ValueError("Pick violates slot rules")

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
    total_picks = num_teams * roster_size
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

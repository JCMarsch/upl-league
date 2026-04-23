import math
import copy
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import require_admin, get_current_user
from app.models.season import Season
from app.models.team import Team
from app.models.user import User
from app.models.schedule import Match
from app.models.stats import TeamSeasonStats
from app.schemas.season import SeasonCreate, SeasonUpdate, SeasonOut, TeamCreate, TeamOut
from app.services.stats_service import sort_standings
from typing import List, Optional

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.post("", response_model=SeasonOut, status_code=201)
def create_season(
    data: SeasonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = Season(**data.model_dump())
    db.add(season)
    db.commit()
    db.refresh(season)
    return season


@router.get("", response_model=List[SeasonOut])
def list_seasons(db: Session = Depends(get_db)):
    return db.query(Season).all()


@router.get("/{season_id}", response_model=SeasonOut)
def get_season(season_id: int, db: Session = Depends(get_db)):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return season


@router.patch("/{season_id}", response_model=SeasonOut)
def update_season(
    season_id: int,
    data: SeasonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != "setup":
        raise HTTPException(status_code=403, detail="Cannot edit season after setup phase")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(season, field, value)
    db.commit()
    db.refresh(season)
    return season


@router.post("/{season_id}/teams", response_model=TeamOut, status_code=201)
def create_team(
    season_id: int,
    data: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    existing = db.query(Team).filter(
        Team.season_id == season_id,
        Team.manager_id == data.manager_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Manager already has a team in this season")

    team = Team(
        season_id=season_id,
        points_remaining=season.points_budget,
        **data.model_dump(),
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.get("/{season_id}/teams", response_model=List[TeamOut])
def list_teams(season_id: int, db: Session = Depends(get_db)):
    return db.query(Team).filter(Team.season_id == season_id).all()


# ---------------------------------------------------------------------------
# Playoff bracket endpoints
# ---------------------------------------------------------------------------

class PlayoffConfigIn(BaseModel):
    num_teams: int
    format: str = "single"
    has_consolation: bool = True


def _build_bracket(num_teams: int, has_consolation: bool) -> dict:
    if num_teams not in {2, 4, 8, 16}:
        raise ValueError("num_teams must be 2, 4, 8, or 16")

    num_rounds = int(math.log2(num_teams))
    seeds = list(range(1, num_teams + 1))
    r1_pairs = list(zip(seeds[: num_teams // 2], reversed(seeds[num_teams // 2 :])))

    r1_matchups = [
        {"slot": i + 1, "seeds": [s1, s2], "from": [], "match_id": None,
         "winner_team_id": None, "loser_team_id": None}
        for i, (s1, s2) in enumerate(r1_pairs)
    ]

    r1_name = {2: "Finals", 4: "Semifinals", 8: "Quarterfinals", 16: "Round of 16"}[num_teams]
    rounds = [{"round_number": 1, "name": r1_name, "consolation": False, "matchups": r1_matchups}]

    prev_count = len(r1_matchups)
    for r in range(2, num_rounds + 1):
        curr_count = prev_count // 2
        name = "Finals" if curr_count == 1 else ("Semifinals" if curr_count == 2 else f"Round {r}")
        matchups = [
            {
                "slot": i + 1, "seeds": [],
                "from": [
                    {"round": r - 1, "slot": i * 2 + 1, "result": "winner"},
                    {"round": r - 1, "slot": i * 2 + 2, "result": "winner"},
                ],
                "match_id": None, "winner_team_id": None, "loser_team_id": None,
            }
            for i in range(curr_count)
        ]
        rounds.append({"round_number": r, "name": name, "consolation": False, "matchups": matchups})
        prev_count = curr_count

    if has_consolation and num_teams >= 4:
        sf_round = num_rounds - 1
        rounds.append({
            "round_number": num_rounds,
            "name": "3rd Place",
            "consolation": True,
            "matchups": [{
                "slot": 1, "seeds": [],
                "from": [
                    {"round": sf_round, "slot": 1, "result": "loser"},
                    {"round": sf_round, "slot": 2, "result": "loser"},
                ],
                "match_id": None, "winner_team_id": None, "loser_team_id": None,
            }],
        })

    return {"num_teams": num_teams, "format": "single", "has_consolation": has_consolation,
            "locked_in": False, "rounds": rounds}


def _resolve_preview(bracket: dict, ranked_teams: list, id_map: dict) -> dict:
    """Annotate bracket matchups with team1/team2 preview based on current standings."""
    preview = copy.deepcopy(bracket)
    seed_map = {
        t["rank"]: {"team_id": t["team_id"], "team_name": t["team_name"]}
        for t in ranked_teams[: bracket["num_teams"]]
    }
    slot_results: dict = {}

    for round_data in preview["rounds"]:
        r = round_data["round_number"]
        consolation = round_data.get("consolation", False)
        for mu in round_data["matchups"]:
            if mu.get("home_team_id") and mu.get("away_team_id"):
                t1 = {"team_id": mu["home_team_id"], "team_name": id_map.get(mu["home_team_id"], f"Team {mu['home_team_id']}")}
                t2 = {"team_id": mu["away_team_id"], "team_name": id_map.get(mu["away_team_id"], f"Team {mu['away_team_id']}")}
                mu["team1"] = t1
                mu["team2"] = t2
                winner_id = mu.get("winner_team_id")
                loser_id = mu.get("loser_team_id")
                if winner_id:
                    slot_results[(r, mu["slot"])] = {
                        "winner": {"team_id": winner_id, "team_name": id_map.get(winner_id, "")},
                        "loser": {"team_id": loser_id, "team_name": id_map.get(loser_id, "")} if loser_id else None,
                    }
                else:
                    slot_results[(r, mu["slot"])] = {"winner": t1, "loser": t2}
            elif mu.get("seeds"):
                t1 = seed_map.get(mu["seeds"][0])
                t2 = seed_map.get(mu["seeds"][1]) if len(mu["seeds"]) > 1 else None
                mu["team1"] = t1
                mu["team2"] = t2
                slot_results[(r, mu["slot"])] = {"winner": t1, "loser": t2}
            else:
                sides = [
                    slot_results.get((ref["round"], ref["slot"]), {}).get(ref["result"])
                    for ref in mu.get("from", [])
                ]
                mu["team1"] = sides[0] if sides else None
                mu["team2"] = sides[1] if len(sides) > 1 else None
                if not consolation:
                    slot_results[(r, mu["slot"])] = {
                        "winner": sides[0] if sides else None,
                        "loser": sides[1] if len(sides) > 1 else None,
                    }

    return preview


def _get_standings_and_id_map(season_id: int, db: Session):
    stats_list = db.query(TeamSeasonStats).filter(TeamSeasonStats.season_id == season_id).all()
    for s in stats_list:
        _ = s.team
    sorted_stats = sort_standings(stats_list)
    ranked = [
        {"team_id": s.team_id, "team_name": s.team.name if s.team else "Unknown", "rank": i + 1}
        for i, s in enumerate(sorted_stats)
    ]
    teams = db.query(Team).filter(Team.season_id == season_id).all()
    id_map = {t.id: t.name for t in teams}
    return ranked, id_map


@router.get("/{season_id}/playoffs")
def get_playoffs(season_id: int, db: Session = Depends(get_db)):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    pf = season.playoff_format or {}
    if not pf.get("rounds"):
        return {"configured": False, "locked_in": False, "bracket": None}
    ranked, id_map = _get_standings_and_id_map(season_id, db)
    return {"configured": True, "locked_in": pf.get("locked_in", False),
            "bracket": _resolve_preview(pf, ranked, id_map)}


@router.post("/{season_id}/playoffs/configure")
def configure_playoffs(
    season_id: int,
    data: PlayoffConfigIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if data.num_teams not in {2, 4, 8, 16}:
        raise HTTPException(status_code=400, detail="num_teams must be 2, 4, 8, or 16")
    existing = season.playoff_format or {}
    if existing.get("locked_in"):
        raise HTTPException(status_code=400, detail="Playoffs already locked in")

    try:
        bracket = _build_bracket(data.num_teams, data.has_consolation)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    bracket["format"] = data.format
    season.playoff_format = bracket
    db.commit()

    ranked, id_map = _get_standings_and_id_map(season_id, db)
    return {"configured": True, "locked_in": False, "bracket": _resolve_preview(bracket, ranked, id_map)}


@router.post("/{season_id}/playoffs/lock-in")
def lock_in_playoffs(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    pf = season.playoff_format or {}
    if not pf.get("rounds"):
        raise HTTPException(status_code=400, detail="Playoffs not configured")
    if pf.get("locked_in"):
        raise HTTPException(status_code=400, detail="Already locked in")

    ranked, id_map = _get_standings_and_id_map(season_id, db)
    seed_map = {t["rank"]: t["team_id"] for t in ranked}

    updated = copy.deepcopy(pf)
    r1 = next((r for r in updated["rounds"] if r["round_number"] == 1 and not r.get("consolation")), None)
    if not r1:
        raise HTTPException(status_code=400, detail="No round 1 found in bracket")

    for mu in r1["matchups"]:
        seeds = mu.get("seeds", [])
        home_id = seed_map.get(seeds[0]) if len(seeds) > 0 else None
        away_id = seed_map.get(seeds[1]) if len(seeds) > 1 else None
        if not home_id or not away_id:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough ranked teams for {updated['num_teams']}-team bracket",
            )
        match = Match(
            season_id=season_id,
            week_number=101,
            home_team_id=home_id,
            away_team_id=away_id,
        )
        db.add(match)
        db.flush()
        mu["match_id"] = match.id
        mu["home_team_id"] = home_id
        mu["away_team_id"] = away_id

    updated["locked_in"] = True
    season.playoff_format = updated
    db.commit()

    return {"configured": True, "locked_in": True, "bracket": _resolve_preview(updated, ranked, id_map)}


@router.post("/{season_id}/playoffs/advance")
def advance_playoffs(
    season_id: int,
    round_number: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """After all matches in round_number are confirmed, create matches for the next round."""
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    pf = season.playoff_format or {}
    if not pf.get("locked_in"):
        raise HTTPException(status_code=400, detail="Playoffs not locked in")

    updated = copy.deepcopy(pf)
    current_round = next(
        (r for r in updated["rounds"] if r["round_number"] == round_number and not r.get("consolation")),
        None,
    )
    if not current_round:
        raise HTTPException(status_code=404, detail=f"Round {round_number} not found")

    slot_results: dict = {}
    for mu in current_round["matchups"]:
        if not mu.get("match_id"):
            raise HTTPException(status_code=400, detail=f"Round {round_number} slot {mu['slot']} has no match yet")
        match = db.query(Match).filter(Match.id == mu["match_id"]).first()
        if not match:
            raise HTTPException(status_code=404, detail=f"Match {mu['match_id']} not found")
        if match.status != "confirmed":
            raise HTTPException(
                status_code=400,
                detail=f"Match {mu['match_id']} (slot {mu['slot']}) not yet confirmed",
            )
        winner_id = match.winner_team_id
        loser_id = match.away_team_id if winner_id == match.home_team_id else match.home_team_id
        slot_results[mu["slot"]] = {"winner": winner_id, "loser": loser_id}
        mu["winner_team_id"] = winner_id
        mu["loser_team_id"] = loser_id

    next_round_num = round_number + 1
    for round_data in updated["rounds"]:
        if round_data["round_number"] != next_round_num:
            continue
        for mu in round_data["matchups"]:
            if mu.get("match_id"):
                continue
            frm = mu.get("from", [])
            if not all(ref.get("round") == round_number for ref in frm):
                continue
            if len(frm) < 2:
                continue
            home_id = slot_results.get(frm[0]["slot"], {}).get(frm[0]["result"])
            away_id = slot_results.get(frm[1]["slot"], {}).get(frm[1]["result"])
            if home_id and away_id:
                match = Match(
                    season_id=season_id,
                    week_number=100 + next_round_num,
                    home_team_id=home_id,
                    away_team_id=away_id,
                )
                db.add(match)
                db.flush()
                mu["match_id"] = match.id
                mu["home_team_id"] = home_id
                mu["away_team_id"] = away_id

    season.playoff_format = updated
    db.commit()

    ranked, id_map = _get_standings_and_id_map(season_id, db)
    return {"configured": True, "locked_in": True, "bracket": _resolve_preview(updated, ranked, id_map)}

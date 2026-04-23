from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.schedule import GameKillEvent, Game, Match
from app.models.pokemon import PokemonSpecies

router = APIRouter(prefix="/seasons/{season_id}/analytics", tags=["analytics"])


def _game_ids_for_season(db: Session, season_id: int):
    match_ids = db.query(Match.id).filter(Match.season_id == season_id).subquery()
    return db.query(Game.id).filter(Game.match_id.in_(match_ids)).subquery()


@router.get("/move-kills")
def move_kills(season_id: int, db: Session = Depends(get_db)):
    game_ids = _game_ids_for_season(db, season_id)
    rows = (
        db.query(
            GameKillEvent.move_name,
            func.count(GameKillEvent.id).label("total"),
            func.sum(
                func.cast(GameKillEvent.kill_type == "direct", db.bind.dialect.name == "postgresql" and "int" or "integer")
            ).label("direct"),
        )
        .filter(
            GameKillEvent.game_id.in_(game_ids),
            GameKillEvent.move_name.isnot(None),
        )
        .group_by(GameKillEvent.move_name)
        .order_by(func.count(GameKillEvent.id).desc())
        .limit(30)
        .all()
    )
    # Simpler approach: count in Python
    all_events = (
        db.query(GameKillEvent)
        .filter(GameKillEvent.game_id.in_(game_ids), GameKillEvent.move_name.isnot(None))
        .all()
    )
    move_map: dict = {}
    for ke in all_events:
        m = ke.move_name or "Unknown"
        if m not in move_map:
            move_map[m] = {"move": m, "total": 0, "direct": 0, "passive": 0}
        move_map[m]["total"] += 1
        if ke.kill_type == "direct":
            move_map[m]["direct"] += 1
        else:
            move_map[m]["passive"] += 1
    return sorted(move_map.values(), key=lambda x: -x["total"])[:30]


@router.get("/matchup-matrix")
def matchup_matrix(season_id: int, db: Session = Depends(get_db)):
    game_ids = _game_ids_for_season(db, season_id)
    events = (
        db.query(GameKillEvent)
        .filter(GameKillEvent.game_id.in_(game_ids), GameKillEvent.kill_type == "direct")
        .all()
    )

    # Find top 20 species by involvement
    species_counts: dict = {}
    for ke in events:
        species_counts[ke.attacker_species_id] = species_counts.get(ke.attacker_species_id, 0) + 1
        species_counts[ke.defender_species_id] = species_counts.get(ke.defender_species_id, 0) + 1
    top_ids = sorted(species_counts, key=lambda x: -species_counts[x])[:20]

    species_names: dict = {}
    for sp in db.query(PokemonSpecies).filter(PokemonSpecies.id.in_(top_ids)).all():
        species_names[sp.id] = sp.name

    matrix: dict = {}
    for ke in events:
        a, d = ke.attacker_species_id, ke.defender_species_id
        if a in top_ids and d in top_ids:
            key = f"{a}:{d}"
            matrix[key] = matrix.get(key, 0) + 1

    return {
        "species": [{"id": sid, "name": species_names.get(sid, f"#{sid}")} for sid in top_ids],
        "cells": [{"attacker_id": int(k.split(":")[0]), "defender_id": int(k.split(":")[1]), "count": v}
                  for k, v in matrix.items()],
    }


@router.get("/turn-distribution")
def turn_distribution(season_id: int, db: Session = Depends(get_db)):
    game_ids = _game_ids_for_season(db, season_id)
    events = (
        db.query(GameKillEvent.turn_number, func.count(GameKillEvent.id).label("kills"))
        .filter(GameKillEvent.game_id.in_(game_ids))
        .group_by(GameKillEvent.turn_number)
        .order_by(GameKillEvent.turn_number)
        .all()
    )
    return [{"turn": e.turn_number, "kills": e.kills} for e in events]


@router.get("/win-conditions")
def win_conditions(season_id: int, db: Session = Depends(get_db)):
    matches = (
        db.query(Match)
        .filter(Match.season_id == season_id, Match.status == "confirmed")
        .all()
    )
    total = len(matches)
    if total == 0:
        return {"total_matches": 0, "game1_winner_wins_match": None, "message": "No confirmed matches yet"}

    wins_when_g1_win = 0
    matches_with_g1 = 0

    for match in matches:
        games = sorted(match.games, key=lambda g: g.game_number)
        if not games:
            continue
        g1 = games[0]
        if g1.winner_team_id is None:
            continue
        matches_with_g1 += 1
        if g1.winner_team_id == match.winner_team_id:
            wins_when_g1_win += 1

    pct = round(wins_when_g1_win / matches_with_g1 * 100, 1) if matches_with_g1 > 0 else None

    return {
        "total_matches": total,
        "matches_with_game1_data": matches_with_g1,
        "game1_winner_wins_match_count": wins_when_g1_win,
        "game1_winner_wins_match_pct": pct,
    }

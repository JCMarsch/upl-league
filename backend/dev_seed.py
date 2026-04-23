"""
Dev fixture seed — creates test users, a season, 8 teams, round-robin schedule,
draft setup, and waiver order for local testing.

Run from the backend directory:
    python dev_seed.py

Safe to re-run — skips anything that already exists (matches on username/season name).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models.user import User
from app.models.season import Season
from app.models.team import Team
from app.models.schedule import Schedule, Match
from app.models.draft import Draft, DraftOrder
from app.models.transaction import WaiverOrder
from app.security import hash_password

db = SessionLocal()

# ── Credentials ───────────────────────────────────────────────────────────────

USERS = [
    {"username": "admin",    "password": "admin123",   "email": "admin@upl.test",    "roles": "admin,superadmin"},
    {"username": "alex",     "password": "password1",  "email": "alex@upl.test",     "roles": "viewer"},
    {"username": "blake",    "password": "password2",  "email": "blake@upl.test",    "roles": "viewer"},
    {"username": "charlie",  "password": "password3",  "email": "charlie@upl.test",  "roles": "viewer"},
    {"username": "diana",    "password": "password4",  "email": "diana@upl.test",    "roles": "viewer"},
    {"username": "evan",     "password": "password5",  "email": "evan@upl.test",     "roles": "viewer"},
    {"username": "fiona",    "password": "password6",  "email": "fiona@upl.test",    "roles": "viewer"},
    {"username": "george",   "password": "password7",  "email": "george@upl.test",   "roles": "viewer"},
    {"username": "helen",    "password": "password8",  "email": "helen@upl.test",    "roles": "viewer"},
]

TEAMS = [
    {"name": "Ironclad Incineroars",  "abbr": "ICI", "color": "#c0392b", "manager": "alex"},
    {"name": "Swift Scizors",         "abbr": "SSC", "color": "#2980b9", "manager": "blake"},
    {"name": "Blazing Volcaronas",    "abbr": "BVC", "color": "#e67e22", "manager": "charlie"},
    {"name": "Phantom Gengars",       "abbr": "PHG", "color": "#8e44ad", "manager": "diana"},
    {"name": "Thunder Raikous",       "abbr": "THR", "color": "#f1c40f", "manager": "evan"},
    {"name": "Tidal Swamperts",       "abbr": "TSW", "color": "#1abc9c", "manager": "fiona"},
    {"name": "Shadow Tyranitars",     "abbr": "STY", "color": "#2c3e50", "manager": "george"},
    {"name": "Mystic Gardevoirs",     "abbr": "MGV", "color": "#e91e63", "manager": "helen"},
]

SEASON_NAME = "UPL Dev Season 1"
WEEKS = 7
BUDGET = 100
ROSTER_SIZE = 10
DRAFT_ROUNDS = ROSTER_SIZE


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_or_create_user(u: dict) -> User:
    existing = db.query(User).filter_by(username=u["username"]).first()
    if existing:
        return existing
    user = User(
        username=u["username"],
        email=u["email"],
        password_hash=hash_password(u["password"]),
        roles=u["roles"],
    )
    db.add(user)
    db.flush()
    print(f"  Created user: {u['username']} / {u['password']}")
    return user


def round_robin_pairs(teams: list) -> list[list[tuple]]:
    """Return WEEKS rounds of (home_idx, away_idx) pairs for n teams."""
    n = len(teams)
    fixed = teams[0]
    rotating = teams[1:]
    rounds = []
    for _ in range(n - 1):
        circle = [fixed] + rotating
        pairs = []
        for i in range(n // 2):
            pairs.append((circle[i], circle[n - 1 - i]))
        rounds.append(pairs)
        rotating = [rotating[-1]] + rotating[:-1]
    return rounds


# ── Run ───────────────────────────────────────────────────────────────────────

print("\n=== UPL Dev Seed ===\n")

# Users
print("Users:")
user_map: dict[str, User] = {}
for u in USERS:
    user_map[u["username"]] = get_or_create_user(u)
db.commit()

# Season
season = db.query(Season).filter_by(name=SEASON_NAME).first()
if not season:
    season = Season(
        name=SEASON_NAME,
        year=2026,
        format="VGC",
        status="draft",
        draft_type="snake",
        points_budget=BUDGET,
        roster_size=ROSTER_SIZE,
        free_pick_slots=0,
        series_format="bo3",
        match_format="round_robin",
        draft_timer_seconds=120,
    )
    db.add(season)
    db.flush()
    print(f"\nCreated season: {SEASON_NAME} (id={season.id})")
else:
    print(f"\nSeason already exists: {SEASON_NAME} (id={season.id})")

# Teams
print("\nTeams:")
team_objs: list[Team] = []
for t in TEAMS:
    manager = user_map[t["manager"]]
    existing = db.query(Team).filter_by(season_id=season.id, name=t["name"]).first()
    if existing:
        team_objs.append(existing)
        print(f"  {t['abbr']} already exists")
    else:
        team = Team(
            season_id=season.id,
            manager_id=manager.id,
            name=t["name"],
            abbreviation=t["abbr"],
            primary_color=t["color"],
            secondary_color="#ffffff",
            points_remaining=BUDGET,
        )
        db.add(team)
        db.flush()
        team_objs.append(team)
        print(f"  Created {t['abbr']} ({t['name']}) → manager: {t['manager']}")

db.commit()

# Draft
draft = db.query(Draft).filter_by(season_id=season.id).first()
if not draft:
    draft = Draft(
        season_id=season.id,
        status="pending",
        current_pick_number=1,
        current_team_id=team_objs[0].id,
        timer_seconds=120,
    )
    db.add(draft)
    db.flush()
    print(f"\nCreated draft (pending)")

    # Snake draft order for all rounds
    n = len(team_objs)
    pick_num = 1
    for rnd in range(1, DRAFT_ROUNDS + 1):
        order = team_objs if rnd % 2 == 1 else list(reversed(team_objs))
        for pos, team in enumerate(order, start=1):
            db.add(DraftOrder(
                draft_id=draft.id,
                round_number=rnd,
                pick_position=pos,
                team_id=team.id,
            ))
    db.commit()
    print(f"  Created snake draft order: {DRAFT_ROUNDS} rounds × {n} teams = {DRAFT_ROUNDS * n} picks")
else:
    print(f"\nDraft already exists (status={draft.status})")

# Schedule — round robin
existing_schedule = db.query(Schedule).filter_by(season_id=season.id).count()
if existing_schedule == 0:
    print("\nSchedule:")
    pairs_by_round = round_robin_pairs(team_objs)
    from datetime import datetime, timezone, timedelta
    start_date = datetime(2026, 5, 5, tzinfo=timezone.utc)  # first match week
    for week_idx, pairs in enumerate(pairs_by_round):
        week_num = week_idx + 1
        week_date = start_date + timedelta(weeks=week_idx)
        for home, away in pairs:
            entry = Schedule(
                season_id=season.id,
                week_number=week_num,
                home_team_id=home.id,
                away_team_id=away.id,
                scheduled_date=week_date,
                status="scheduled",
            )
            db.add(entry)
            db.flush()
            match = Match(
                schedule_id=entry.id,
                season_id=season.id,
                week_number=week_num,
                home_team_id=home.id,
                away_team_id=away.id,
                status="pending",
            )
            db.add(match)
        print(f"  Week {week_num}: {len(pairs)} matches")
    db.commit()
else:
    print(f"\nSchedule already exists ({existing_schedule} entries)")

# Waiver order (reverse of team creation order — last team gets first waiver pick)
existing_waiver = db.query(WaiverOrder).filter_by(season_id=season.id, week_number=1).count()
if existing_waiver == 0:
    for pos, team in enumerate(reversed(team_objs), start=1):
        db.add(WaiverOrder(
            season_id=season.id,
            week_number=1,
            team_id=team.id,
            priority_position=pos,
        ))
    db.commit()
    print("\nCreated waiver order (week 1)")

# ── Summary ───────────────────────────────────────────────────────────────────

print("\n" + "=" * 50)
print("CREDENTIALS")
print("=" * 50)
print(f"{'Username':<12} {'Password':<12} {'Role':<20} {'Team'}")
print("-" * 60)
admin_u = next(u for u in USERS if u["roles"] != "viewer")
print(f"  {admin_u['username']:<10} {admin_u['password']:<12} {admin_u['roles']:<20} (admin — no team)")
for t in TEAMS:
    u = next(u for u in USERS if u["username"] == t["manager"])
    print(f"  {u['username']:<10} {u['password']:<12} viewer               {t['abbr']} {t['name']}")

print("\nSeason:", SEASON_NAME, f"(id={season.id})")
print("Status: draft  →  go to /admin to start the draft or change status")
print("=" * 50 + "\n")

db.close()

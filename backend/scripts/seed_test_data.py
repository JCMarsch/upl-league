"""
Seed test data: 1 season, 6 teams, test users.
Idempotent - safe to re-run.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from passlib.context import CryptContext
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import *
from app.database import Base

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_user(db: Session, username: str, password: str, roles: str, email: str = None) -> User:
    existing = db.query(User).filter_by(username=username).first()
    if existing:
        return existing
    user = User(
        username=username,
        password_hash=pwd_context.hash(password),
        email=email or f"{username}@upl.test",
        roles=roles,
    )
    db.add(user)
    db.flush()
    return user


def seed_test_data(db: Session):
    print("Seeding test data...")

    # Create users
    admin = create_user(db, "admin", "admin123", "superadmin,admin", "admin@upl.test")
    managers = []
    for i in range(1, 7):
        m = create_user(db, f"manager{i}", "password", "manager", f"manager{i}@upl.test")
        managers.append(m)
    db.commit()

    # Create season
    existing_season = db.query(Season).filter_by(name="UPL Season 1").first()
    if not existing_season:
        season = Season(
            name="UPL Season 1",
            format="VGC",
            year=2025,
            status="setup",
            draft_type="snake",
            draft_timer_seconds=90,
            points_budget=100,
            roster_size=10,
            required_slots={"S": 1, "A": 2},
            series_format="bo3",
            match_format="round_robin",
        )
        db.add(season)
        db.flush()
    else:
        season = existing_season

    # Create teams
    team_data = [
        ("Red Foxes", "RF", "#cc0000", "#ffffff"),
        ("Blue Wolves", "BW", "#0033cc", "#ffffff"),
        ("Green Dragons", "GD", "#00aa44", "#ffffff"),
        ("Purple Phoenix", "PP", "#660099", "#ffffff"),
        ("Golden Eagles", "GE", "#cc9900", "#000000"),
        ("Silver Storm", "SS", "#999999", "#000000"),
    ]

    teams = []
    for i, (name, abbr, primary, secondary) in enumerate(team_data):
        existing = db.query(Team).filter_by(season_id=season.id, manager_id=managers[i].id).first()
        if existing:
            teams.append(existing)
            continue
        team = Team(
            season_id=season.id,
            manager_id=managers[i].id,
            name=name,
            abbreviation=abbr,
            primary_color=primary,
            secondary_color=secondary,
            points_remaining=season.points_budget,
        )
        db.add(team)
        db.flush()
        teams.append(team)

    db.commit()

    # Add some test pokemon to season if species exist
    species_list = db.query(PokemonSpecies).limit(30).all()
    tiers = ["S", "S", "A", "A", "A", "B", "B", "B", "B", "C",
             "C", "C", "C", "C", "D", "D", "D", "D", "D", "D",
             "D", "D", "D", "D", "D", "D", "D", "D", "D", "D"]
    costs = [20, 18, 15, 14, 13, 10, 9, 9, 8, 7,
             7, 7, 6, 6, 5, 5, 4, 4, 4, 3,
             3, 3, 3, 3, 2, 2, 2, 2, 2, 1]

    for idx, species in enumerate(species_list):
        existing = db.query(SeasonPokemon).filter_by(
            season_id=season.id, species_id=species.id
        ).first()
        if not existing:
            sp = SeasonPokemon(
                season_id=season.id,
                species_id=species.id,
                tier=tiers[idx] if idx < len(tiers) else "D",
                point_cost=costs[idx] if idx < len(costs) else 1,
                is_legal=True,
            )
            db.add(sp)

    db.commit()
    print(f"Test data seeded: 1 season, {len(teams)} teams, {len(managers)} managers")
    print("Admin login: admin / admin123")
    print("Manager logins: manager1-6 / password")


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_test_data(db)
    finally:
        db.close()

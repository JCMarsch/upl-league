"""Tests verifying all models can be created and queried."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.security import hash_password

from app.database import Base
from app.models.user import User
from app.models.season import Season
from app.models.team import Team
from app.models.pokemon import PokemonSpecies, SeasonPokemon, RosterPokemon


SQLITE_URL = "sqlite://"
engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
SessionLocal = sessionmaker(bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def make_species(db, name="Pikachu", dex=25):
    s = PokemonSpecies(
        pokedex_number=dex,
        name=name,
        forme_name=name.lower(),
        type1="Electric",
        hp=35, atk=55, def_=40, spatk=50, spdef=50, spe=90, total=320,
        is_base_forme=True,
    )
    db.add(s)
    db.commit()
    return s


def test_user_can_be_created_and_queried(db):
    user = User(username="testuser", password_hash=hash_password("pw"), roles="manager")
    db.add(user)
    db.commit()
    result = db.query(User).filter_by(username="testuser").first()
    assert result is not None
    assert result.username == "testuser"


def test_season_can_be_created_and_queried(db):
    season = Season(name="Test Season", year=2025, format="VGC")
    db.add(season)
    db.commit()
    result = db.query(Season).filter_by(name="Test Season").first()
    assert result is not None
    assert result.year == 2025


def test_team_can_be_created_with_season_and_user(db):
    user = User(username="manager1", password_hash="hash", roles="manager")
    db.add(user)
    db.flush()
    season = Season(name="S1", year=2025)
    db.add(season)
    db.flush()
    team = Team(season_id=season.id, manager_id=user.id, name="Red Foxes")
    db.add(team)
    db.commit()
    result = db.query(Team).filter_by(name="Red Foxes").first()
    assert result.season_id == season.id


def test_pokemon_species_can_be_created(db):
    species = make_species(db)
    result = db.query(PokemonSpecies).filter_by(name="Pikachu").first()
    assert result is not None
    assert result.type1 == "Electric"
    assert result.total == 320


def test_mega_forme_links_to_base_forme(db):
    base = make_species(db, "Charizard", 6)
    mega = PokemonSpecies(
        pokedex_number=6,
        name="Charizard",
        forme_name="charizard-mega-x",
        is_mega=True,
        is_base_forme=False,
        base_forme_id=base.id,
        type1="Fire",
        type2="Dragon",
        hp=78, atk=130, def_=111, spatk=130, spdef=85, spe=100, total=634,
    )
    db.add(mega)
    db.commit()

    result = db.query(PokemonSpecies).filter_by(forme_name="charizard-mega-x").first()
    assert result.is_mega is True
    assert result.base_forme_id == base.id
    assert result.base_forme.name == "Charizard"


def test_seed_idempotent(db):
    """Running the seeder twice should not create duplicates."""
    def insert_pikachu():
        existing = db.query(PokemonSpecies).filter_by(
            pokedex_number=25, forme_name="pikachu"
        ).first()
        if not existing:
            s = PokemonSpecies(
                pokedex_number=25, name="Pikachu", forme_name="pikachu",
                type1="Electric", hp=35, atk=55, def_=40, spatk=50, spdef=50, spe=90, total=320,
            )
            db.add(s)
            db.commit()

    insert_pikachu()
    insert_pikachu()

    count = db.query(PokemonSpecies).filter_by(pokedex_number=25).count()
    assert count == 1


def test_season_pokemon_links_correctly(db):
    season = Season(name="S1", year=2025)
    db.add(season)
    db.flush()
    species = make_species(db)
    sp = SeasonPokemon(season_id=season.id, species_id=species.id, tier="A", point_cost=10)
    db.add(sp)
    db.commit()

    result = db.query(SeasonPokemon).filter_by(season_id=season.id).first()
    assert result.tier == "A"
    assert result.species.name == "Pikachu"

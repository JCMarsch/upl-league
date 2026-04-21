import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db
from app.models.user import User
from app.models.season import Season
from app.models.team import Team
from app.models.pokemon import PokemonSpecies, SeasonPokemon
from app.security import hash_password
from app.auth import create_access_token

SQLALCHEMY_TEST_DATABASE_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def test_admin(db_session):
    user = User(username="admin", password_hash=hash_password("admin123"), roles="superadmin,admin")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_manager(db_session):
    user = User(username="manager1", password_hash=hash_password("password"), roles="manager")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def admin_headers(test_admin):
    token = create_access_token({"sub": str(test_admin.id)})
    return {"Cookie": f"access_token={token}"}


@pytest.fixture
def manager_headers(test_manager):
    token = create_access_token({"sub": str(test_manager.id)})
    return {"Cookie": f"access_token={token}"}


@pytest.fixture
def test_season(db_session):
    season = Season(name="Test Season", year=2025, format="VGC", status="setup", points_budget=100)
    db_session.add(season)
    db_session.commit()
    db_session.refresh(season)
    return season


@pytest.fixture
def test_teams(db_session, test_season):
    teams = []
    for i in range(6):
        user = User(
            username=f"mgr{i}", password_hash=hash_password("pw"), roles="manager"
        )
        db_session.add(user)
        db_session.flush()
        team = Team(
            season_id=test_season.id,
            manager_id=user.id,
            name=f"Team {i}",
            abbreviation=f"T{i}",
            points_remaining=test_season.points_budget,
        )
        db_session.add(team)
        db_session.flush()
        teams.append(team)
    db_session.commit()
    return teams


@pytest.fixture
def test_pokemon_species(db_session):
    species_list = []
    pokemon_data = [
        (25, "Pikachu", "Electric", None),
        (6, "Charizard", "Fire", "Flying"),
        (149, "Dragonite", "Dragon", "Flying"),
        (248, "Tyranitar", "Rock", "Dark"),
        (373, "Salamence", "Dragon", "Flying"),
        (445, "Garchomp", "Dragon", "Ground"),
    ]
    for dex, name, t1, t2 in pokemon_data:
        s = PokemonSpecies(
            pokedex_number=dex, name=name, forme_name=name.lower(),
            type1=t1, type2=t2, hp=80, atk=100, def_=80, spatk=80, spdef=80, spe=80, total=500,
            is_base_forme=True,
        )
        db_session.add(s)
        db_session.flush()
        species_list.append(s)
    db_session.commit()
    return species_list

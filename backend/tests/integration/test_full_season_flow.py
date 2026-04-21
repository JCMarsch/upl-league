"""Integration tests - full season flow."""
import pytest
from app.models.season import Season
from app.models.team import Team
from app.models.pokemon import SeasonPokemon, RosterPokemon
from app.models.draft import Draft
from app.models.schedule import Match
from app.models.stats import TeamSeasonStats, SeasonResult
from app.auth import create_access_token


def admin_h(test_admin):
    token = create_access_token({"sub": str(test_admin.id)})
    return {"Cookie": f"access_token={token}"}


def mgr_h(team):
    token = create_access_token({"sub": str(team.manager_id)})
    return {"Cookie": f"access_token={token}"}


def test_full_season_happy_path(
    test_client, db_session, test_admin, test_teams, test_season, test_pokemon_species
):
    """
    End-to-end test of a mini season:
    1. Season is in setup (from fixtures)
    2. Admin sets tiers and locks
    3. Draft starts - 2 rounds for 6 teams
    4. Schedule generated
    5. Matches submitted and confirmed
    6. Season closed with champions
    """
    admin_headers = admin_h(test_admin)

    # Step 2: Set tiers for all pokemon
    updates = [
        {"species_id": sp.id, "tier": "A", "point_cost": 5}
        for sp in test_pokemon_species
    ]
    r = test_client.post(
        f"/seasons/{test_season.id}/pokemon/bulk-update",
        json={"updates": updates},
        headers=admin_headers,
    )
    assert r.status_code == 200

    # Lock tiers
    r = test_client.post(f"/seasons/{test_season.id}/lock-tiers", headers=admin_headers)
    assert r.status_code == 200

    # Step 3: Start draft
    test_season.roster_size = 1  # minimal for test
    db_session.commit()

    r = test_client.post(f"/draft/{test_season.id}/start", headers=admin_headers)
    assert r.status_code == 200

    # Make picks for all 6 teams
    draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
    for i in range(6):
        db_session.refresh(draft)
        if draft.status == "complete":
            break
        current_team = db_session.query(Team).filter_by(id=draft.current_team_id).first()
        headers = mgr_h(current_team)

        sp = db_session.query(SeasonPokemon).filter(
            SeasonPokemon.season_id == test_season.id,
            SeasonPokemon.drafted_by_team_id == None,
            SeasonPokemon.is_legal == True,
        ).first()
        if not sp:
            break

        r = test_client.post(
            f"/draft/{test_season.id}/pick",
            json={"season_pokemon_id": sp.id},
            headers=headers,
        )
        assert r.status_code == 200

    # Step 4: Generate schedule
    r = test_client.post(f"/seasons/{test_season.id}/schedule/generate", headers=admin_headers)
    assert r.status_code == 200

    # Step 5: Submit and confirm matches
    matches = db_session.query(Match).filter_by(season_id=test_season.id).all()
    for match in matches[:3]:  # confirm first 3 matches
        home_team = db_session.query(Team).filter_by(id=match.home_team_id).first()
        away_team = db_session.query(Team).filter_by(id=match.away_team_id).first()

        test_client.post(
            f"/matches/{match.id}/submit",
            json={"home_games_won": 2, "away_games_won": 1},
            headers=mgr_h(home_team),
        )
        test_client.post(
            f"/matches/{match.id}/confirm",
            headers=mgr_h(away_team),
        )

    # Step 6: Create team stats and close season
    teams = db_session.query(Team).filter_by(season_id=test_season.id).all()
    for team in teams:
        stats = TeamSeasonStats(
            team_id=team.id,
            season_id=test_season.id,
            match_wins=1,
            match_losses=0,
            win_percentage=1.0,
            total_kills=5,
        )
        db_session.add(stats)
    db_session.commit()

    r = test_client.post(f"/seasons/{test_season.id}/close", headers=admin_headers)
    assert r.status_code == 200

    # Verify champion recorded
    champion = db_session.query(SeasonResult).filter(
        SeasonResult.season_id == test_season.id, SeasonResult.champion == True
    ).first()
    assert champion is not None


def test_waiver_mid_season_flow(
    test_client, db_session, test_admin, test_teams, test_season, test_pokemon_species
):
    """Waiver claim flow."""
    admin_headers = admin_h(test_admin)
    team = test_teams[0]

    # Add an available pokemon to the season
    sp = SeasonPokemon(
        season_id=test_season.id,
        species_id=test_pokemon_species[0].id,
        tier="A",
        point_cost=5,
        is_legal=True,
    )
    db_session.add(sp)
    db_session.commit()

    # Submit waiver
    r = test_client.post(
        f"/seasons/{test_season.id}/waivers",
        json={"add_species_id": sp.species_id},
        headers=mgr_h(team),
    )
    assert r.status_code == 201
    waiver_id = r.json()["id"]

    # Admin processes it
    r = test_client.post(
        f"/seasons/{test_season.id}/waivers/{waiver_id}/process?approve=true",
        headers=admin_headers,
    )
    assert r.status_code == 200

    db_session.refresh(sp)
    assert sp.drafted_by_team_id == team.id

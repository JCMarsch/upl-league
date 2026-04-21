import pytest
from app.models.pokemon import SeasonPokemon, RosterPokemon
from app.auth import create_access_token


def create_roster(db_session, team, species_list, season):
    """Create roster entries for a team."""
    for species in species_list[:3]:
        sp = SeasonPokemon(
            season_id=season.id,
            species_id=species.id,
            tier="A",
            point_cost=10,
            is_legal=True,
            drafted_by_team_id=team.id,
        )
        db_session.add(sp)
        db_session.flush()
        rp = RosterPokemon(team_id=team.id, season_pokemon_id=sp.id)
        db_session.add(rp)
    db_session.commit()


def get_manager_headers(team):
    token = create_access_token({"sub": str(team.manager_id)})
    return {"Cookie": f"access_token={token}"}


def test_public_view_shows_roster_correctly(
    test_client, test_season, test_teams, test_pokemon_species, db_session
):
    team = test_teams[0]
    create_roster(db_session, team, test_pokemon_species, test_season)

    response = test_client.get(f"/teams/{team.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == team.id
    assert len(data["roster"]) == 3


def test_edit_mode_saves_and_persists(
    test_client, test_season, test_teams, test_pokemon_species, db_session, admin_headers
):
    team = test_teams[0]
    create_roster(db_session, team, test_pokemon_species, test_season)

    rp = db_session.query(RosterPokemon).filter_by(team_id=team.id).first()
    headers = get_manager_headers(team)

    response = test_client.patch(
        f"/teams/{team.id}/pokemon/{rp.id}",
        json={"ability": "Intimidate", "item": "Choice Scarf", "move1": "Flare Blitz"},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ability"] == "Intimidate"
    assert data["item"] == "Choice Scarf"

    # Verify persisted
    db_session.refresh(rp)
    assert rp.ability == "Intimidate"


def test_other_manager_cannot_edit_team(
    test_client, test_season, test_teams, test_pokemon_species, db_session
):
    team = test_teams[0]
    other_team = test_teams[1]
    create_roster(db_session, team, test_pokemon_species, test_season)

    rp = db_session.query(RosterPokemon).filter_by(team_id=team.id).first()
    other_headers = get_manager_headers(other_team)

    response = test_client.patch(
        f"/teams/{team.id}/pokemon/{rp.id}",
        json={"ability": "Hacked"},
        headers=other_headers,
    )
    assert response.status_code == 403


def test_admin_can_edit_any_team(
    test_client, test_season, test_teams, test_pokemon_species, db_session, admin_headers
):
    team = test_teams[0]
    create_roster(db_session, team, test_pokemon_species, test_season)

    rp = db_session.query(RosterPokemon).filter_by(team_id=team.id).first()

    response = test_client.patch(
        f"/teams/{team.id}/pokemon/{rp.id}",
        json={"tera_type": "Fire"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["tera_type"] == "Fire"

import pytest
from app.models.pokemon import SeasonPokemon, RosterPokemon
from app.models.transaction import WaiverOrder
from app.auth import create_access_token


def setup_season_pokemon(db_session, season, species_list, team=None):
    result = []
    for i, sp_obj in enumerate(species_list):
        drafted_by = team.id if (team and i == 0) else None
        sp = SeasonPokemon(
            season_id=season.id,
            species_id=sp_obj.id,
            tier="A",
            point_cost=5,
            is_legal=True,
            drafted_by_team_id=drafted_by,
        )
        db_session.add(sp)
        if drafted_by:
            db_session.flush()
            rp = RosterPokemon(team_id=team.id, season_pokemon_id=sp.id)
            db_session.add(rp)
        result.append(sp)
    db_session.commit()
    return result


def manager_headers(team):
    token = create_access_token({"sub": str(team.manager_id)})
    return {"Cookie": f"access_token={token}"}


def test_waiver_claim_adds_pokemon_to_team(
    test_client, test_season, test_teams, test_pokemon_species, db_session, admin_headers
):
    team = test_teams[0]
    sps = setup_season_pokemon(db_session, test_season, test_pokemon_species)
    available_sp = next(s for s in sps if s.drafted_by_team_id is None)

    response = test_client.post(
        f"/seasons/{test_season.id}/waivers",
        json={"add_species_id": available_sp.species_id},
        headers=manager_headers(team),
    )
    assert response.status_code == 201

    # Admin approves
    waiver_id = response.json()["id"]
    test_client.post(
        f"/seasons/{test_season.id}/waivers/{waiver_id}/process?approve=true",
        headers=admin_headers,
    )
    db_session.refresh(available_sp)
    assert available_sp.drafted_by_team_id == team.id


def test_waiver_claim_blocked_for_drafted_pokemon(
    test_client, test_season, test_teams, test_pokemon_species, db_session
):
    team = test_teams[0]
    other_team = test_teams[1]
    sps = setup_season_pokemon(db_session, test_season, test_pokemon_species)
    # Mark first as drafted by other team
    sps[0].drafted_by_team_id = other_team.id
    db_session.commit()

    response = test_client.post(
        f"/seasons/{test_season.id}/waivers",
        json={"add_species_id": sps[0].species_id},
        headers=manager_headers(team),
    )
    assert response.status_code == 400


def test_waiver_order_starts_as_reverse_draft_order(
    test_client, test_season, test_teams, db_session, admin_headers
):
    """Waiver order can be manually set."""
    team_ids = [t.id for t in test_teams]
    # Create waiver order entries (reverse draft order = last drafter picks first)
    for i, team_id in enumerate(reversed(team_ids)):
        order = WaiverOrder(
            season_id=test_season.id,
            week_number=1,
            team_id=team_id,
            priority_position=i + 1,
        )
        db_session.add(order)
    db_session.commit()

    response = test_client.get(f"/seasons/{test_season.id}/waiver-order")
    assert response.status_code == 200
    order_data = response.json()
    assert order_data[0]["team_id"] == team_ids[-1]  # last team has priority 1

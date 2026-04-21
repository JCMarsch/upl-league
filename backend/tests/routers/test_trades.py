import pytest
from app.models.pokemon import SeasonPokemon, RosterPokemon
from app.auth import create_access_token


def setup_rosters(db_session, season, teams, species_list):
    """Each team gets some pokemon."""
    result = []
    for i, team in enumerate(teams[:2]):
        for j in range(2):
            sp_idx = i * 2 + j
            if sp_idx >= len(species_list):
                break
            sp = SeasonPokemon(
                season_id=season.id,
                species_id=species_list[sp_idx].id,
                tier="A",
                point_cost=5,
                is_legal=True,
                drafted_by_team_id=team.id,
            )
            db_session.add(sp)
            db_session.flush()
            rp = RosterPokemon(team_id=team.id, season_pokemon_id=sp.id)
            db_session.add(rp)
            result.append(sp)
    db_session.commit()
    return result


def manager_headers(team):
    token = create_access_token({"sub": str(team.manager_id)})
    return {"Cookie": f"access_token={token}"}


def test_trade_proposal_creates_pending_trade(
    test_client, test_season, test_teams, test_pokemon_species, db_session
):
    sps = setup_rosters(db_session, test_season, test_teams, test_pokemon_species)
    team1 = test_teams[0]
    team2 = test_teams[1]
    t1_sp = [s for s in sps if s.drafted_by_team_id == team1.id]
    t2_sp = [s for s in sps if s.drafted_by_team_id == team2.id]

    response = test_client.post(
        f"/seasons/{test_season.id}/trades",
        json={
            "proposed_to_team_id": team2.id,
            "give_species_ids": [t1_sp[0].species_id],
            "receive_species_ids": [t2_sp[0].species_id],
        },
        headers=manager_headers(team1),
    )
    assert response.status_code == 201
    assert response.json()["status"] == "pending"


def test_trade_vote_is_one_per_team(
    test_client, test_season, test_teams, test_pokemon_species, db_session
):
    sps = setup_rosters(db_session, test_season, test_teams, test_pokemon_species)
    team1, team2 = test_teams[0], test_teams[1]
    t1_sp = [s for s in sps if s.drafted_by_team_id == team1.id]
    t2_sp = [s for s in sps if s.drafted_by_team_id == team2.id]

    trade_resp = test_client.post(
        f"/seasons/{test_season.id}/trades",
        json={
            "proposed_to_team_id": team2.id,
            "give_species_ids": [t1_sp[0].species_id],
            "receive_species_ids": [t2_sp[0].species_id],
        },
        headers=manager_headers(team1),
    )
    trade_id = trade_resp.json()["id"]

    # Vote once
    test_client.post(f"/trades/{trade_id}/vote", json={"vote": "approve"}, headers=manager_headers(team1))
    # Vote again - should fail
    response = test_client.post(f"/trades/{trade_id}/vote", json={"vote": "approve"}, headers=manager_headers(team1))
    assert response.status_code == 400


def test_admin_can_confirm_trade_without_vote(
    test_client, test_season, test_teams, test_pokemon_species, db_session, admin_headers
):
    sps = setup_rosters(db_session, test_season, test_teams, test_pokemon_species)
    team1, team2 = test_teams[0], test_teams[1]
    t1_sp = [s for s in sps if s.drafted_by_team_id == team1.id]
    t2_sp = [s for s in sps if s.drafted_by_team_id == team2.id]

    trade_resp = test_client.post(
        f"/seasons/{test_season.id}/trades",
        json={
            "proposed_to_team_id": team2.id,
            "give_species_ids": [t1_sp[0].species_id],
            "receive_species_ids": [t2_sp[0].species_id],
        },
        headers=manager_headers(team1),
    )
    trade_id = trade_resp.json()["id"]

    response = test_client.post(f"/trades/{trade_id}/confirm", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "approved"


def test_cancelled_trade_does_not_move_pokemon(
    test_client, test_season, test_teams, test_pokemon_species, db_session
):
    sps = setup_rosters(db_session, test_season, test_teams, test_pokemon_species)
    team1, team2 = test_teams[0], test_teams[1]
    t1_sp = [s for s in sps if s.drafted_by_team_id == team1.id]
    t2_sp = [s for s in sps if s.drafted_by_team_id == team2.id]

    trade_resp = test_client.post(
        f"/seasons/{test_season.id}/trades",
        json={
            "proposed_to_team_id": team2.id,
            "give_species_ids": [t1_sp[0].species_id],
            "receive_species_ids": [t2_sp[0].species_id],
        },
        headers=manager_headers(team1),
    )
    trade_id = trade_resp.json()["id"]

    test_client.post(f"/trades/{trade_id}/cancel", headers=manager_headers(team1))

    db_session.refresh(t1_sp[0])
    assert t1_sp[0].drafted_by_team_id == team1.id  # pokemon didn't move

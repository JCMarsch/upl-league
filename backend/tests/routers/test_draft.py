"""Critical draft tests - Section 5 from test spec."""
import pytest
from app.models.draft import Draft, DraftOrder
from app.models.pokemon import SeasonPokemon, RosterPokemon
from app.models.team import Team
from app.auth import create_access_token


def setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species):
    """Set season to draft status and add legal pokemon."""
    test_season.status = "draft"
    test_season.roster_size = 3  # small for testing
    db_session.flush()
    for sp_obj in test_pokemon_species:
        sp = SeasonPokemon(
            season_id=test_season.id,
            species_id=sp_obj.id,
            tier="A",
            point_cost=5,
            is_legal=True,
        )
        db_session.add(sp)
    db_session.commit()


def start_draft_as_admin(test_client, admin_headers, season_id):
    return test_client.post(f"/draft/{season_id}/start", headers=admin_headers)


def get_manager_headers_for_team(db_session, team):
    token = create_access_token({"sub": str(team.manager_id)})
    return {"Cookie": f"access_token={token}"}


# ===== Basic flow =====

def test_draft_cannot_start_before_tiers_locked(test_client, admin_headers, test_season, test_teams):
    # season status is 'setup', not 'draft'
    response = start_draft_as_admin(test_client, admin_headers, test_season.id)
    assert response.status_code == 400


def test_admin_can_start_draft(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    response = start_draft_as_admin(test_client, admin_headers, test_season.id)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "active"
    assert data["current_pick_number"] == 1


def test_manager_cannot_start_draft(
    test_client, manager_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    response = test_client.post(f"/draft/{test_season.id}/start", headers=manager_headers)
    assert response.status_code == 403


def test_pick_on_your_turn_succeeds(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    start_draft_as_admin(test_client, admin_headers, test_season.id)

    draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
    current_team = db_session.query(Team).filter_by(id=draft.current_team_id).first()
    headers = get_manager_headers_for_team(db_session, current_team)

    sp = db_session.query(SeasonPokemon).filter_by(season_id=test_season.id).first()
    response = test_client.post(
        f"/draft/{test_season.id}/pick",
        json={"season_pokemon_id": sp.id},
        headers=headers,
    )
    assert response.status_code == 200


def test_pick_on_someone_elses_turn_returns_403(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    start_draft_as_admin(test_client, admin_headers, test_season.id)

    draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
    # Get a team that is NOT on the clock
    current_id = draft.current_team_id
    other_team = db_session.query(Team).filter(
        Team.season_id == test_season.id,
        Team.id != current_id,
    ).first()
    headers = get_manager_headers_for_team(db_session, other_team)

    sp = db_session.query(SeasonPokemon).filter_by(season_id=test_season.id).first()
    response = test_client.post(
        f"/draft/{test_season.id}/pick",
        json={"season_pokemon_id": sp.id},
        headers=headers,
    )
    assert response.status_code == 403


def test_pick_already_drafted_pokemon_returns_400(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    start_draft_as_admin(test_client, admin_headers, test_season.id)

    draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
    current_team = db_session.query(Team).filter_by(id=draft.current_team_id).first()
    headers = get_manager_headers_for_team(db_session, current_team)

    sp = db_session.query(SeasonPokemon).filter_by(season_id=test_season.id).first()
    # Mark as already drafted
    sp.drafted_by_team_id = current_team.id
    db_session.commit()

    response = test_client.post(
        f"/draft/{test_season.id}/pick",
        json={"season_pokemon_id": sp.id},
        headers=headers,
    )
    assert response.status_code == 400


def test_pick_illegal_pokemon_returns_400(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    start_draft_as_admin(test_client, admin_headers, test_season.id)

    draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
    current_team = db_session.query(Team).filter_by(id=draft.current_team_id).first()
    headers = get_manager_headers_for_team(db_session, current_team)

    sp = db_session.query(SeasonPokemon).filter_by(season_id=test_season.id).first()
    sp.is_legal = False
    db_session.commit()

    response = test_client.post(
        f"/draft/{test_season.id}/pick",
        json={"season_pokemon_id": sp.id},
        headers=headers,
    )
    assert response.status_code == 400


def test_pick_pokemon_over_budget_returns_400(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    # Set team points to 0
    teams = db_session.query(Team).filter_by(season_id=test_season.id).all()
    for t in teams:
        t.points_remaining = 0
    db_session.commit()

    start_draft_as_admin(test_client, admin_headers, test_season.id)

    draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
    current_team = db_session.query(Team).filter_by(id=draft.current_team_id).first()
    headers = get_manager_headers_for_team(db_session, current_team)

    sp = db_session.query(SeasonPokemon).filter_by(season_id=test_season.id).first()
    response = test_client.post(
        f"/draft/{test_season.id}/pick",
        json={"season_pokemon_id": sp.id},
        headers=headers,
    )
    assert response.status_code == 400


def test_pick_increments_pick_number(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    start_draft_as_admin(test_client, admin_headers, test_season.id)

    draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
    initial_pick = draft.current_pick_number
    current_team = db_session.query(Team).filter_by(id=draft.current_team_id).first()
    headers = get_manager_headers_for_team(db_session, current_team)

    sp = db_session.query(SeasonPokemon).filter_by(season_id=test_season.id).first()
    test_client.post(
        f"/draft/{test_season.id}/pick",
        json={"season_pokemon_id": sp.id},
        headers=headers,
    )

    db_session.refresh(draft)
    assert draft.current_pick_number == initial_pick + 1


def test_pick_decrements_team_points_remaining(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    start_draft_as_admin(test_client, admin_headers, test_season.id)

    draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
    current_team = db_session.query(Team).filter_by(id=draft.current_team_id).first()
    initial_points = current_team.points_remaining
    headers = get_manager_headers_for_team(db_session, current_team)

    sp = db_session.query(SeasonPokemon).filter_by(season_id=test_season.id).first()
    test_client.post(
        f"/draft/{test_season.id}/pick",
        json={"season_pokemon_id": sp.id},
        headers=headers,
    )

    db_session.refresh(current_team)
    assert current_team.points_remaining == initial_points - (sp.point_cost or 0)


def test_pick_removes_pokemon_from_available_pool(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    start_draft_as_admin(test_client, admin_headers, test_season.id)

    draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
    current_team = db_session.query(Team).filter_by(id=draft.current_team_id).first()
    headers = get_manager_headers_for_team(db_session, current_team)

    sp = db_session.query(SeasonPokemon).filter_by(season_id=test_season.id).first()
    test_client.post(
        f"/draft/{test_season.id}/pick",
        json={"season_pokemon_id": sp.id},
        headers=headers,
    )

    db_session.refresh(sp)
    assert sp.drafted_by_team_id == current_team.id


# ===== Snake order tests =====

def test_turn_transitions_to_next_team_after_pick(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    start_draft_as_admin(test_client, admin_headers, test_season.id)

    draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
    first_team_id = draft.current_team_id
    current_team = db_session.query(Team).filter_by(id=first_team_id).first()
    headers = get_manager_headers_for_team(db_session, current_team)

    sp = db_session.query(SeasonPokemon).filter_by(season_id=test_season.id).first()
    test_client.post(
        f"/draft/{test_season.id}/pick",
        json={"season_pokemon_id": sp.id},
        headers=headers,
    )

    db_session.refresh(draft)
    assert draft.current_team_id != first_team_id, "Team should change after pick"


def test_turn_does_not_stay_on_same_team_after_pick(
    test_client, admin_headers, test_season, test_teams, test_pokemon_species, db_session
):
    """The cascading bug test - current_team_id must change after each pick."""
    setup_draft_ready_season(db_session, test_season, test_teams, test_pokemon_species)
    start_draft_as_admin(test_client, admin_headers, test_season.id)

    pokemon_list = db_session.query(SeasonPokemon).filter_by(season_id=test_season.id).all()

    for i in range(3):
        draft = db_session.query(Draft).filter_by(season_id=test_season.id).first()
        if draft.status == "complete":
            break
        team_before = draft.current_team_id
        current_team = db_session.query(Team).filter_by(id=team_before).first()
        headers = get_manager_headers_for_team(db_session, current_team)

        available = db_session.query(SeasonPokemon).filter(
            SeasonPokemon.season_id == test_season.id,
            SeasonPokemon.drafted_by_team_id == None,
            SeasonPokemon.is_legal == True,
        ).first()
        assert available is not None

        test_client.post(
            f"/draft/{test_season.id}/pick",
            json={"season_pokemon_id": available.id},
            headers=headers,
        )
        db_session.refresh(draft)
        if draft.status != "complete":
            assert draft.current_team_id != team_before, f"Pick {i+1}: team did not change!"

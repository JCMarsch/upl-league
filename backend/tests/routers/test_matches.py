import pytest
from app.models.schedule import Match
from app.auth import create_access_token


def make_match(db_session, season, teams, week=1):
    """Create a match between first two teams."""
    match = Match(
        season_id=season.id,
        week_number=week,
        home_team_id=teams[0].id,
        away_team_id=teams[1].id,
        home_games_won=0,
        away_games_won=0,
        status="pending",
    )
    db_session.add(match)
    db_session.commit()
    db_session.refresh(match)
    return match


def manager_headers(team):
    token = create_access_token({"sub": str(team.manager_id)})
    return {"Cookie": f"access_token={token}"}


def test_submit_result_creates_pending_match(
    test_client, test_season, test_teams, db_session, admin_headers
):
    match = make_match(db_session, test_season, test_teams)
    home_headers = manager_headers(test_teams[0])
    response = test_client.post(
        f"/matches/{match.id}/submit",
        json={"home_games_won": 2, "away_games_won": 1},
        headers=home_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "submitted"


def test_confirm_result_changes_status_to_confirmed(
    test_client, test_season, test_teams, db_session
):
    match = make_match(db_session, test_season, test_teams)
    home_headers = manager_headers(test_teams[0])
    away_headers = manager_headers(test_teams[1])

    test_client.post(
        f"/matches/{match.id}/submit",
        json={"home_games_won": 2, "away_games_won": 1},
        headers=home_headers,
    )

    response = test_client.post(f"/matches/{match.id}/confirm", headers=away_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


def test_cannot_confirm_own_submission(
    test_client, test_season, test_teams, db_session
):
    match = make_match(db_session, test_season, test_teams)
    home_headers = manager_headers(test_teams[0])

    test_client.post(
        f"/matches/{match.id}/submit",
        json={"home_games_won": 2, "away_games_won": 1},
        headers=home_headers,
    )

    response = test_client.post(f"/matches/{match.id}/confirm", headers=home_headers)
    assert response.status_code == 403


def test_admin_can_confirm_any_result(
    test_client, test_season, test_teams, db_session, admin_headers
):
    match = make_match(db_session, test_season, test_teams)
    home_headers = manager_headers(test_teams[0])

    test_client.post(
        f"/matches/{match.id}/submit",
        json={"home_games_won": 2, "away_games_won": 1},
        headers=home_headers,
    )

    response = test_client.post(f"/matches/{match.id}/confirm", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


def test_cannot_submit_already_confirmed_match(
    test_client, test_season, test_teams, db_session
):
    match = make_match(db_session, test_season, test_teams)
    match.status = "confirmed"
    db_session.commit()

    home_headers = manager_headers(test_teams[0])
    response = test_client.post(
        f"/matches/{match.id}/submit",
        json={"home_games_won": 2, "away_games_won": 1},
        headers=home_headers,
    )
    assert response.status_code == 400


def test_conflicting_submissions_create_dispute_state(
    test_client, test_season, test_teams, db_session
):
    match = make_match(db_session, test_season, test_teams)
    home_headers = manager_headers(test_teams[0])
    away_headers = manager_headers(test_teams[1])

    test_client.post(
        f"/matches/{match.id}/submit",
        json={"home_games_won": 2, "away_games_won": 1},
        headers=home_headers,
    )

    # Away submits a different result
    response = test_client.post(
        f"/matches/{match.id}/submit",
        json={"home_games_won": 1, "away_games_won": 2},
        headers=away_headers,
    )
    assert response.json()["status"] == "disputed"


def test_draw_result_recorded_correctly(
    test_client, test_season, test_teams, db_session
):
    match = make_match(db_session, test_season, test_teams)
    home_headers = manager_headers(test_teams[0])

    response = test_client.post(
        f"/matches/{match.id}/submit",
        json={"home_games_won": 1, "away_games_won": 1},
        headers=home_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["winner_team_id"] is None


def test_schedule_generator_no_team_plays_itself(
    test_client, admin_headers, test_season, test_teams, db_session
):
    """Test that schedule generator produces correct matchups."""
    response = test_client.post(
        f"/seasons/{test_season.id}/schedule/generate",
        headers=admin_headers,
    )
    assert response.status_code == 200

    schedule = test_client.get(f"/seasons/{test_season.id}/schedule").json()
    for entry in schedule:
        assert entry["home_team_id"] != entry["away_team_id"], "Team plays itself!"

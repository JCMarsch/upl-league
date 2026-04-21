import pytest


def make_season_data(**kwargs):
    base = {
        "name": "Test Season",
        "year": 2025,
        "format": "VGC",
        "points_budget": 100,
        "roster_size": 10,
        "series_format": "bo3",
    }
    base.update(kwargs)
    return base


def test_create_season_as_admin_succeeds(test_client, admin_headers):
    response = test_client.post("/seasons", json=make_season_data(), headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Season"
    assert data["status"] == "setup"


def test_create_season_as_manager_returns_403(test_client, manager_headers):
    response = test_client.post("/seasons", json=make_season_data(), headers=manager_headers)
    assert response.status_code == 403


def test_create_season_missing_required_fields_returns_422(test_client, admin_headers):
    response = test_client.post("/seasons", json={"name": "Bad"}, headers=admin_headers)
    assert response.status_code == 422


def test_get_season_returns_correct_data(test_client, admin_headers, test_season):
    response = test_client.get(f"/seasons/{test_season.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_season.id
    assert data["name"] == test_season.name


def test_update_season_config_in_setup_status_succeeds(test_client, admin_headers, test_season):
    response = test_client.patch(
        f"/seasons/{test_season.id}",
        json={"name": "Updated Season"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Season"


def test_update_season_config_after_draft_starts_returns_403(
    test_client, admin_headers, test_season, db_session
):
    test_season.status = "draft"
    db_session.commit()
    response = test_client.patch(
        f"/seasons/{test_season.id}",
        json={"name": "New Name"},
        headers=admin_headers,
    )
    assert response.status_code == 403


def test_create_team_assigns_correct_manager(test_client, admin_headers, test_season, test_manager):
    response = test_client.post(
        f"/seasons/{test_season.id}/teams",
        json={"name": "Red Team", "manager_id": test_manager.id},
        headers=admin_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["manager_id"] == test_manager.id
    assert data["points_remaining"] == test_season.points_budget


def test_cannot_assign_same_manager_to_two_teams_in_same_season(
    test_client, admin_headers, test_season, test_manager
):
    test_client.post(
        f"/seasons/{test_season.id}/teams",
        json={"name": "Team A", "manager_id": test_manager.id},
        headers=admin_headers,
    )
    response = test_client.post(
        f"/seasons/{test_season.id}/teams",
        json={"name": "Team B", "manager_id": test_manager.id},
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_list_teams_returns_all_teams_for_season(test_client, test_season, test_teams):
    response = test_client.get(f"/seasons/{test_season.id}/teams")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 6

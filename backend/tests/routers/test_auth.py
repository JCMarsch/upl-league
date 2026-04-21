import pytest
from datetime import timedelta


def test_login_valid_credentials_returns_token(test_client, test_admin):
    response = test_client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Login successful"
    assert "access_token" in response.cookies


def test_login_invalid_password_returns_401(test_client, test_admin):
    response = test_client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert response.status_code == 401


def test_login_unknown_user_returns_401(test_client):
    response = test_client.post("/auth/login", json={"username": "nobody", "password": "pw"})
    assert response.status_code == 401


def test_get_me_with_valid_token_returns_user(test_client, admin_headers, test_admin):
    response = test_client.get("/auth/me", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "admin"


def test_get_me_with_no_token_returns_401(test_client):
    response = test_client.get("/auth/me")
    assert response.status_code == 401


def test_get_me_with_expired_token_returns_401(test_client, test_admin):
    from app.auth import create_access_token
    token = create_access_token({"sub": str(test_admin.id)}, expires_delta=timedelta(seconds=-1))
    response = test_client.get("/auth/me", headers={"Cookie": f"access_token={token}"})
    assert response.status_code == 401


def test_manager_cannot_access_admin_endpoint(test_client, manager_headers, test_admin):
    response = test_client.post(
        "/auth/register",
        json={"username": "new_user", "password": "pw", "roles": "viewer"},
        headers=manager_headers,
    )
    assert response.status_code == 403


def test_admin_can_access_admin_endpoint(test_client, admin_headers):
    response = test_client.post(
        "/auth/register",
        json={"username": "new_user", "password": "pw123", "roles": "viewer"},
        headers=admin_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "new_user"


def test_create_user_as_admin_succeeds(test_client, admin_headers):
    response = test_client.post(
        "/auth/register",
        json={"username": "player1", "password": "pw456", "roles": "manager"},
        headers=admin_headers,
    )
    assert response.status_code == 201


def test_create_user_as_manager_returns_403(test_client, manager_headers):
    response = test_client.post(
        "/auth/register",
        json={"username": "player2", "password": "pw", "roles": "viewer"},
        headers=manager_headers,
    )
    assert response.status_code == 403

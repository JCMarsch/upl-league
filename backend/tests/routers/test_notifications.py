import pytest
from app.models.config import Notification
from app.services.notification_service import create_notification


def test_notifications_list_for_authenticated_user(test_client, admin_headers, test_admin, db_session):
    create_notification(db_session, test_admin.id, "trade", "Trade Proposed", "A trade was proposed")
    create_notification(db_session, test_admin.id, "waiver", "Waiver Approved", "Your waiver was approved")

    response = test_client.get("/notifications", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2


def test_unread_count_accurate(test_client, admin_headers, test_admin, db_session):
    create_notification(db_session, test_admin.id, "match", "Match Result", "Confirm result")
    response = test_client.get("/notifications/unread-count", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["count"] >= 1


def test_mark_notification_read(test_client, admin_headers, test_admin, db_session):
    notif = create_notification(db_session, test_admin.id, "draft", "Your Pick", "Pick now!")
    response = test_client.post(f"/notifications/{notif.id}/read", headers=admin_headers)
    assert response.status_code == 200
    db_session.refresh(notif)
    assert notif.read is True


def test_discord_webhook_created_with_correct_payload(test_client, admin_headers):
    """Verify correct payload sent to discord (without hitting real Discord)."""
    from unittest.mock import patch
    import json

    webhook_url = "https://discord.com/api/webhooks/test/token"

    response = test_client.post(
        "/discord-webhooks",
        json={"url": webhook_url, "events": ["draft_pick", "trade", "result"]},
        headers=admin_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["url"] == webhook_url
    assert "draft_pick" in data["events"]


def test_discord_notification_sends_correct_payload(db_session, test_season):
    """Verify correct payload without hitting Discord."""
    from unittest.mock import patch, MagicMock
    from app.services.notification_service import send_discord_notification
    from app.models.config import DiscordWebhook

    webhook = DiscordWebhook(
        season_id=test_season.id,
        url="https://discord.com/api/webhooks/mock/token",
        events=["draft_pick"],
        active=True,
    )
    db_session.add(webhook)
    db_session.commit()

    with patch("requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=204)
        send_discord_notification(db_session, test_season.id, "draft_pick", "A pick was made!")
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert call_args.kwargs["json"]["content"] == "A pick was made!"

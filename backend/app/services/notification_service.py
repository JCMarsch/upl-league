"""Notification service - in-app, email, and Discord."""
import smtplib
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import requests

from sqlalchemy.orm import Session
from app.models.config import Notification, DiscordWebhook
from app.models.user import User
from app.config import settings


def create_notification(
    db: Session,
    user_id: int,
    type: str,
    title: str,
    body: str = "",
    link: str = "",
) -> Notification:
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        link=link,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


def send_discord_notification(
    db: Session,
    season_id: int,
    event_type: str,
    message: str,
):
    """Send a Discord webhook notification if configured for this event."""
    webhooks = db.query(DiscordWebhook).filter(
        DiscordWebhook.season_id == season_id,
        DiscordWebhook.active == True,
    ).all()

    for webhook in webhooks:
        events = webhook.events or []
        if event_type not in events:
            continue
        try:
            payload = {"content": message}
            requests.post(webhook.url, json=payload, timeout=5)
        except Exception:
            pass  # Discord failures never block the main flow


def send_email_notification(
    to_email: str,
    subject: str,
    body_html: str,
):
    """Send email notification via SMTP."""
    if not settings.smtp_host or not settings.smtp_user:
        return  # Email not configured

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_user
        msg["To"] = to_email
        msg.attach(MIMEText(body_html, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_pass or "")
            server.send_message(msg)
    except Exception:
        pass  # Email failures never block the main flow

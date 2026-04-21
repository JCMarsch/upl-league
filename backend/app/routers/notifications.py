from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user, require_admin
from app.models.config import Notification, DiscordWebhook
from app.models.user import User
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(tags=["notifications"])


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: Optional[str]
    read: bool
    link: Optional[str]

    model_config = {"from_attributes": True}


class DiscordWebhookCreate(BaseModel):
    url: str
    events: List[str]
    season_id: Optional[int] = None


@router.get("/notifications", response_model=List[NotificationOut])
def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(50).all()


@router.post("/notifications/{notif_id}/read")
def mark_read(
    notif_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current_user.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read = True
    db.commit()
    return {"status": "read"}


@router.post("/notifications/read-all")
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False,
    ).update({"read": True})
    db.commit()
    return {"status": "all read"}


@router.get("/notifications/unread-count")
def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False,
    ).count()
    return {"count": count}


@router.post("/discord-webhooks", status_code=201)
def create_discord_webhook(
    data: DiscordWebhookCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    webhook = DiscordWebhook(
        season_id=data.season_id,
        url=data.url,
        events=data.events,
        active=True,
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)
    return {"id": webhook.id, "url": webhook.url, "events": webhook.events}


@router.get("/discord-webhooks")
def list_discord_webhooks(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    webhooks = db.query(DiscordWebhook).all()
    return [{"id": w.id, "url": w.url, "events": w.events, "active": w.active} for w in webhooks]

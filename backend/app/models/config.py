from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class LeagueConfig(Base):
    __tablename__ = "league_config"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, nullable=False)
    value = Column(String, nullable=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    season = relationship("Season")
    updated_by = relationship("User")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(String, nullable=True)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    link = Column(String, nullable=True)

    user = relationship("User", back_populates="notifications")


class DiscordWebhook(Base):
    __tablename__ = "discord_webhooks"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=True)
    url = Column(String, nullable=False)
    events = Column(JSON, default=list)
    active = Column(Boolean, default=True)

    season = relationship("Season", back_populates="discord_webhooks")

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Draft(Base):
    __tablename__ = "drafts"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, unique=True)
    status = Column(String, default="pending")  # pending/active/paused/complete
    current_pick_number = Column(Integer, default=1)
    current_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    pick_started_at = Column(DateTime(timezone=True), nullable=True)
    timer_seconds = Column(Integer, nullable=True)

    season = relationship("Season", back_populates="draft")
    current_team = relationship("Team")
    picks = relationship("DraftPick", back_populates="draft")
    order = relationship("DraftOrder", back_populates="draft")


class DraftPick(Base):
    __tablename__ = "draft_picks"

    id = Column(Integer, primary_key=True, index=True)
    draft_id = Column(Integer, ForeignKey("drafts.id"), nullable=False, index=True)
    pick_number = Column(Integer, nullable=False)
    round_number = Column(Integer, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    season_pokemon_id = Column(Integer, ForeignKey("season_pokemon.id"), nullable=False)
    picked_at = Column(DateTime(timezone=True), server_default=func.now())
    time_taken_seconds = Column(Integer, nullable=True)

    draft = relationship("Draft", back_populates="picks")
    team = relationship("Team")
    season_pokemon = relationship("SeasonPokemon")


class DraftOrder(Base):
    __tablename__ = "draft_order"

    id = Column(Integer, primary_key=True, index=True)
    draft_id = Column(Integer, ForeignKey("drafts.id"), nullable=False, index=True)
    round_number = Column(Integer, nullable=False)
    pick_position = Column(Integer, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)

    draft = relationship("Draft", back_populates="order")
    team = relationship("Team")

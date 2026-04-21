from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    abbreviation = Column(String, nullable=True)
    logo_url = Column(String, nullable=True)
    primary_color = Column(String, default="#1a1a2e")
    secondary_color = Column(String, default="#ffffff")
    points_remaining = Column(Integer, default=100)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    season = relationship("Season", back_populates="teams")
    manager = relationship("User", back_populates="teams")
    roster = relationship("RosterPokemon", back_populates="team")
    season_stats = relationship("TeamSeasonStats", back_populates="team", uselist=False)

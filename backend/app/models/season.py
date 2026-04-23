from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Season(Base):
    __tablename__ = "seasons"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    format = Column(String, default="VGC")  # VGC or Singles
    year = Column(Integer, nullable=False)
    status = Column(String, default="setup")  # setup/draft/regular/playoffs/complete
    draft_type = Column(String, default="snake")  # snake or auction
    draft_timer_seconds = Column(Integer, nullable=True)
    draft_timer_mode = Column(String, default="fixed")  # fixed or reducing
    draft_timer_end_seconds = Column(Integer, nullable=True)  # end timer for reducing mode
    points_budget = Column(Integer, default=100)
    roster_size = Column(Integer, default=10)
    free_pick_slots = Column(Integer, default=0)
    required_slots = Column(JSON, default=dict)  # {mega: 1, S: 1, ...}
    series_format = Column(String, default="bo3")
    match_format = Column(String, default="round_robin")
    playoff_format = Column(JSON, default=dict)
    keeper_enabled = Column(Boolean, default=False)
    language = Column(String, default="en")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teams = relationship("Team", back_populates="season")
    season_pokemon = relationship("SeasonPokemon", back_populates="season")
    draft = relationship("Draft", back_populates="season", uselist=False)
    schedule = relationship("Schedule", back_populates="season")
    matches = relationship("Match", back_populates="season")
    waivers = relationship("Waiver", back_populates="season")
    trades = relationship("Trade", back_populates="season")
    awards = relationship("Award", back_populates="season")
    season_results = relationship("SeasonResult", back_populates="season")
    discord_webhooks = relationship("DiscordWebhook", back_populates="season")

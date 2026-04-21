from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Waiver(Base):
    __tablename__ = "waivers"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    week_number = Column(Integer, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    add_species_id = Column(Integer, ForeignKey("pokemon_species.id"), nullable=False)
    drop_species_id = Column(Integer, ForeignKey("pokemon_species.id"), nullable=True)
    priority_at_time = Column(Integer, nullable=True)
    status = Column(String, default="pending")  # pending/approved/denied/processed
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)
    processed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(String, nullable=True)

    season = relationship("Season", back_populates="waivers")
    team = relationship("Team")
    add_species = relationship("PokemonSpecies", foreign_keys=[add_species_id])
    drop_species = relationship("PokemonSpecies", foreign_keys=[drop_species_id])
    processed_by = relationship("User")


class WaiverOrder(Base):
    __tablename__ = "waiver_order"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    week_number = Column(Integer, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    priority_position = Column(Integer, nullable=False)

    season = relationship("Season")
    team = relationship("Team")


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    proposed_by_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    proposed_to_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    status = Column(String, default="pending")  # pending/voting/approved/denied/cancelled/executed
    proposed_at = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    effective_week = Column(Integer, nullable=True)
    notes = Column(String, nullable=True)

    season = relationship("Season", back_populates="trades")
    proposed_by_team = relationship("Team", foreign_keys=[proposed_by_team_id])
    proposed_to_team = relationship("Team", foreign_keys=[proposed_to_team_id])
    assets = relationship("TradeAsset", back_populates="trade")
    votes = relationship("TradeVote", back_populates="trade")


class TradeAsset(Base):
    __tablename__ = "trade_assets"

    id = Column(Integer, primary_key=True, index=True)
    trade_id = Column(Integer, ForeignKey("trades.id"), nullable=False, index=True)
    from_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    to_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    season_pokemon_id = Column(Integer, ForeignKey("season_pokemon.id"), nullable=False)

    trade = relationship("Trade", back_populates="assets")
    from_team = relationship("Team", foreign_keys=[from_team_id])
    to_team = relationship("Team", foreign_keys=[to_team_id])
    season_pokemon = relationship("SeasonPokemon")


class TradeVote(Base):
    __tablename__ = "trade_votes"

    id = Column(Integer, primary_key=True, index=True)
    trade_id = Column(Integer, ForeignKey("trades.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    vote = Column(String, nullable=False)  # approve/deny
    voted_at = Column(DateTime(timezone=True), server_default=func.now())

    trade = relationship("Trade", back_populates="votes")
    team = relationship("Team")

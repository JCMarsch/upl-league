from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class TeamSeasonStats(Base):
    __tablename__ = "team_season_stats"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    games_played = Column(Integer, default=0)
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)
    draws = Column(Integer, default=0)
    game_differential = Column(Integer, default=0)
    match_wins = Column(Integer, default=0)
    match_losses = Column(Integer, default=0)
    match_draws = Column(Integer, default=0)
    match_differential = Column(Integer, default=0)
    direct_kills = Column(Integer, default=0)
    passive_kills = Column(Integer, default=0)
    total_kills = Column(Integer, default=0)
    direct_deaths = Column(Integer, default=0)
    passive_deaths = Column(Integer, default=0)
    total_deaths = Column(Integer, default=0)
    kill_death_differential = Column(Integer, default=0)
    win_percentage = Column(Float, default=0.0)
    streak = Column(Integer, default=0)

    team = relationship("Team", back_populates="season_stats")
    season = relationship("Season")


class H2HRecord(Base):
    __tablename__ = "h2h_records"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    team_a_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    team_b_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    team_a_match_wins = Column(Integer, default=0)
    team_b_match_wins = Column(Integer, default=0)
    draws = Column(Integer, default=0)

    season = relationship("Season")
    team_a = relationship("Team", foreign_keys=[team_a_id])
    team_b = relationship("Team", foreign_keys=[team_b_id])


class PokemonSeasonStats(Base):
    __tablename__ = "pokemon_season_stats"

    id = Column(Integer, primary_key=True, index=True)
    species_id = Column(Integer, ForeignKey("pokemon_species.id"), nullable=False, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    games_played = Column(Integer, default=0)
    games_won = Column(Integer, default=0)
    games_brought = Column(Integer, default=0)
    games_led = Column(Integer, default=0)
    direct_kills = Column(Integer, default=0)
    passive_kills = Column(Integer, default=0)
    total_kills = Column(Integer, default=0)
    direct_deaths = Column(Integer, default=0)
    passive_deaths = Column(Integer, default=0)
    total_deaths = Column(Integer, default=0)
    kill_death_differential = Column(Integer, default=0)
    pick_number = Column(Integer, nullable=True)
    acquired_via = Column(String, nullable=True)

    species = relationship("PokemonSpecies")
    season = relationship("Season")
    team = relationship("Team")


class Award(Base):
    __tablename__ = "awards"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    icon_url = Column(String, nullable=True)
    is_auto_calculated = Column(Boolean, default=False)
    auto_calc_metric = Column(String, nullable=True)
    recipient_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    recipient_notes = Column(String, nullable=True)
    awarded_at = Column(DateTime(timezone=True), server_default=func.now())

    season = relationship("Season", back_populates="awards")
    recipient_team = relationship("Team")


class SeasonResult(Base):
    __tablename__ = "season_results"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    final_rank = Column(Integer, nullable=True)
    champion = Column(Boolean, default=False)
    runner_up = Column(Boolean, default=False)
    playoff_result = Column(String, nullable=True)

    season = relationship("Season", back_populates="season_results")
    team = relationship("Team")

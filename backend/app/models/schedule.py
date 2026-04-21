from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Schedule(Base):
    __tablename__ = "schedule"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    week_number = Column(Integer, nullable=False)
    home_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    away_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    scheduled_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="scheduled")  # scheduled/completed/postponed

    season = relationship("Season", back_populates="schedule")
    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])
    match = relationship("Match", back_populates="schedule_entry", uselist=False)


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedule.id"), nullable=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    week_number = Column(Integer, nullable=False)
    home_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    away_team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    home_games_won = Column(Integer, default=0)
    away_games_won = Column(Integer, default=0)
    winner_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    status = Column(String, default="pending")  # pending/submitted/confirmed/disputed
    submitted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(String, nullable=True)

    schedule_entry = relationship("Schedule", back_populates="match")
    season = relationship("Season", back_populates="matches")
    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])
    winner_team = relationship("Team", foreign_keys=[winner_team_id])
    submitted_by = relationship("User", foreign_keys=[submitted_by_id])
    confirmed_by = relationship("User", foreign_keys=[confirmed_by_id])
    games = relationship("Game", back_populates="match")


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False, index=True)
    game_number = Column(Integer, nullable=False)
    winner_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    loser_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    replay_url = Column(String, nullable=True)
    replay_source = Column(String, nullable=True)  # showdown/champions
    replay_parsed = Column(Boolean, default=False)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())

    match = relationship("Match", back_populates="games")
    winner_team = relationship("Team", foreign_keys=[winner_team_id])
    loser_team = relationship("Team", foreign_keys=[loser_team_id])
    stats = relationship("GameStat", back_populates="game")


class GameStat(Base):
    __tablename__ = "game_stats"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    species_id = Column(Integer, ForeignKey("pokemon_species.id"), nullable=False)
    was_brought = Column(Boolean, default=False)
    was_lead = Column(Boolean, default=False)
    direct_kills = Column(Integer, default=0)
    passive_kills = Column(Integer, default=0)
    direct_deaths = Column(Integer, default=0)
    passive_deaths = Column(Integer, default=0)
    notes = Column(String, nullable=True)

    game = relationship("Game", back_populates="stats")
    team = relationship("Team")
    species = relationship("PokemonSpecies")

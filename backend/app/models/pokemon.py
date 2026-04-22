from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class PokemonSpecies(Base):
    __tablename__ = "pokemon_species"

    id = Column(Integer, primary_key=True, index=True)
    pokedex_number = Column(Integer, nullable=False, index=True)
    name = Column(String, nullable=False)
    forme_name = Column(String, nullable=True)
    is_base_forme = Column(Boolean, default=True)
    base_forme_id = Column(Integer, ForeignKey("pokemon_species.id"), nullable=True)
    is_mega = Column(Boolean, default=False)
    is_regional_variant = Column(Boolean, default=False)
    type1 = Column(String, nullable=False)
    type2 = Column(String, nullable=True)
    hp = Column(Integer, default=0)
    atk = Column(Integer, default=0)
    def_ = Column("def", Integer, default=0)
    spatk = Column(Integer, default=0)
    spdef = Column(Integer, default=0)
    spe = Column(Integer, default=0)
    total = Column(Integer, default=0)
    sprite_url = Column(String, nullable=True)
    artwork_url = Column(String, nullable=True)
    shiny_sprite_url = Column(String, nullable=True)
    shiny_artwork_url = Column(String, nullable=True)
    format_legality = Column(JSON, default=dict)
    generation = Column(Integer, nullable=True)
    can_coexist_with = Column(JSON, default=list)

    base_forme = relationship("PokemonSpecies", remote_side="PokemonSpecies.id", foreign_keys=[base_forme_id])
    season_pokemon = relationship("SeasonPokemon", back_populates="species")


class SeasonPokemon(Base):
    __tablename__ = "season_pokemon"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    species_id = Column(Integer, ForeignKey("pokemon_species.id"), nullable=False, index=True)
    tier = Column(String, nullable=True)
    point_cost = Column(Integer, nullable=True)
    is_legal = Column(Boolean, default=True)
    drafted_by_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    draft_pick_number = Column(Integer, nullable=True)
    acquired_via = Column(String, nullable=True)  # draft/waiver/trade/FA
    locked_at = Column(DateTime(timezone=True), nullable=True)

    season = relationship("Season", back_populates="season_pokemon")
    species = relationship("PokemonSpecies", back_populates="season_pokemon")
    drafted_by_team = relationship("Team")
    roster_pokemon = relationship("RosterPokemon", back_populates="season_pokemon", uselist=False)


class RosterPokemon(Base):
    __tablename__ = "roster_pokemon"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    season_pokemon_id = Column(Integer, ForeignKey("season_pokemon.id"), nullable=False)
    nickname = Column(String, nullable=True)
    ability = Column(String, nullable=True)
    item = Column(String, nullable=True)
    move1 = Column(String, nullable=True)
    move2 = Column(String, nullable=True)
    move3 = Column(String, nullable=True)
    move4 = Column(String, nullable=True)
    tera_type = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    team = relationship("Team", back_populates="roster")
    season_pokemon = relationship("SeasonPokemon", back_populates="roster_pokemon")

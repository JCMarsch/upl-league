from sqlalchemy import Column, Integer, String, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    season_pokemon_id = Column(Integer, ForeignKey("season_pokemon.id", ondelete="CASCADE"), nullable=False)
    priority = Column(Integer, nullable=False, default=0)
    conditions_operator = Column(String, nullable=True)  # AND / OR / null
    conditions = Column(JSON, nullable=True)  # [{type: 'already_have'|'pokemon_gone', species_id: int}]

    team = relationship("Team")
    season_pokemon = relationship("SeasonPokemon")

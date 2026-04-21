from sqlalchemy import Column, Integer, String, ARRAY, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=True)
    discord_id = Column(String, nullable=True)
    roles = Column(String, default="viewer")  # comma-separated roles
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teams = relationship("Team", back_populates="manager")
    notifications = relationship("Notification", back_populates="user")

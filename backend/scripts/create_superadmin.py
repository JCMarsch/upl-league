"""Create an initial superadmin account. Run once after first deploy."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.models.user import User
from app.security import hash_password

engine = create_engine(settings.database_url)
Session = sessionmaker(bind=engine)


def main():
    username = input("Superadmin username: ").strip()
    email = input("Superadmin email: ").strip()
    password = input("Superadmin password: ").strip()

    if not username or not password:
        print("Username and password are required.")
        sys.exit(1)

    with Session() as db:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            print(f"User '{username}' already exists.")
            sys.exit(1)

        user = User(
            username=username,
            email=email,
            hashed_password=hash_password(password),
            roles="superadmin,admin",
        )
        db.add(user)
        db.commit()
        print(f"Superadmin '{username}' created successfully.")


if __name__ == "__main__":
    main()

"""
Dev user seed — creates test accounts for local testing.

Run from the backend directory:
    python dev_seed.py

Safe to re-run — skips users that already exist.

CREDENTIALS
-----------
admin     / admin123    — roles: admin, superadmin
alex      / password1
blake     / password2
charlie   / password3
diana     / password4
evan      / password5
fiona     / password6
george    / password7
helen     / password8
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models.user import User
from app.security import hash_password

USERS = [
    {"username": "admin",   "password": "admin123",  "email": "admin@upl.test",   "roles": "admin,superadmin"},
    {"username": "alex",    "password": "password1", "email": "alex@upl.test",    "roles": "viewer"},
    {"username": "blake",   "password": "password2", "email": "blake@upl.test",   "roles": "viewer"},
    {"username": "charlie", "password": "password3", "email": "charlie@upl.test", "roles": "viewer"},
    {"username": "diana",   "password": "password4", "email": "diana@upl.test",   "roles": "viewer"},
    {"username": "evan",    "password": "password5", "email": "evan@upl.test",    "roles": "viewer"},
    {"username": "fiona",   "password": "password6", "email": "fiona@upl.test",   "roles": "viewer"},
    {"username": "george",  "password": "password7", "email": "george@upl.test",  "roles": "viewer"},
    {"username": "helen",   "password": "password8", "email": "helen@upl.test",   "roles": "viewer"},
]

db = SessionLocal()

print("\n=== Dev User Seed ===\n")
for u in USERS:
    existing = db.query(User).filter_by(username=u["username"]).first()
    if existing:
        print(f"  skip  {u['username']} (already exists)")
    else:
        db.add(User(
            username=u["username"],
            email=u["email"],
            password_hash=hash_password(u["password"]),
            roles=u["roles"],
        ))
        print(f"  ok    {u['username']} / {u['password']}")

db.commit()
db.close()
print("\nDone. Log in as 'admin' / 'admin123' to get started.\n")

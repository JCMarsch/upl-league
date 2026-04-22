"""
Seed Pokemon species from PokeAPI via the shared service.
Upserts by forme_name — safe to re-run.
Usage:  python scripts/seed_pokemon.py [--dry-run]
"""
import sys, os, argparse
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import SessionLocal, engine, Base
from app.services.pokemon_seed import run_seed, _fetch, _should_skip

BASE_URL = "https://pokeapi.co/api/v2"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.dry_run:
        data = _fetch(f"{BASE_URL}/pokemon?limit=10000")
        if data:
            all_slugs = [e["name"] for e in data["results"]]
            to_process = [s for s in all_slugs if not _should_skip(s)]
            print(f"Total in PokeAPI: {len(all_slugs)}")
            print(f"Would process: {len(to_process)}")
            print(f"Would skip (cosmetic): {len(all_slugs) - len(to_process)}")
        sys.exit(0)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        def progress(done, total):
            print(f"  [{done/total*100:.0f}%] {done}/{total}")

        print("Seeding Pokemon from PokeAPI...")
        result = run_seed(db, progress_cb=progress)
        print(f"\nDone! Created: {result['created']}, Updated: {result['updated']}, "
              f"Errors: {result['errors']}, Cosmetic skipped: {result['skipped']}")
    finally:
        db.close()

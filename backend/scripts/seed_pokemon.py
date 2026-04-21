"""
Seed Pokemon species from PokeAPI.
Focuses on Gen 9 (Scarlet/Violet) + all VGC-legal Pokemon.
Idempotent - safe to re-run without duplicates.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import requests
import time
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import *
from app.database import Base

BASE_URL = "https://pokeapi.co/api/v2"

# Gen 9 Pokedex range + notable formes
GEN9_RANGE = range(906, 1026)  # Sprigatito to Pecharunt

# Regional/special formes to include
SPECIAL_FORMES = [
    # Mega evolutions (Gen 1-6)
    "charizard-mega-x", "charizard-mega-y", "blastoise-mega", "venusaur-mega",
    "beedrill-mega", "pidgeot-mega", "slowbro-mega", "gengar-mega",
    "kangaskhan-mega", "pinsir-mega", "gyarados-mega", "lapras-mega",
    "aerodactyl-mega", "mewtwo-mega-x", "mewtwo-mega-y",
    "ampharos-mega", "steelix-mega", "scizor-mega", "heracross-mega",
    "houndoom-mega", "tyranitar-mega", "blaziken-mega", "gardevoir-mega",
    "mawile-mega", "aggron-mega", "medicham-mega", "manectric-mega",
    "banette-mega", "absol-mega", "garchomp-mega", "lucario-mega",
    "abomasnow-mega", "alakazam-mega", "sableye-mega", "altaria-mega",
    "gallade-mega", "audino-mega", "latias-mega", "latios-mega",
    "swampert-mega", "sceptile-mega", "camerupt-mega", "sharpedo-mega",
    "glalie-mega", "salamence-mega", "metagross-mega", "rayquaza-mega",
    "diancie-mega", "lopunny-mega", "beedrill-mega",
    # Alolan forms
    "rattata-alola", "raticate-alola", "raichu-alola", "sandshrew-alola",
    "sandslash-alola", "vulpix-alola", "ninetales-alola", "diglett-alola",
    "dugtrio-alola", "meowth-alola", "persian-alola", "geodude-alola",
    "graveler-alola", "golem-alola", "grimer-alola", "muk-alola",
    "exeggutor-alola", "marowak-alola",
    # Galarian forms
    "meowth-galar", "ponyta-galar", "rapidash-galar", "slowpoke-galar",
    "slowbro-galar", "farfetchd-galar", "weezing-galar", "mr-mime-galar",
    "articuno-galar", "zapdos-galar", "moltres-galar", "slowking-galar",
    "corsola-galar", "zigzagoon-galar", "linoone-galar", "darumaka-galar",
    "darmanitan-galar", "yamask-galar", "stunfisk-galar",
    # Hisuian forms
    "decidueye-hisui", "typhlosion-hisui", "samurott-hisui",
    "lilligant-hisui", "zorua-hisui", "zoroark-hisui", "braviary-hisui",
    "sliggoo-hisui", "goodra-hisui", "avalugg-hisui", "voltorb-hisui",
    "electrode-hisui", "sneasel-hisui", "qwilfish-hisui",
    # Paradox Pokemon (already in Gen 9 range)
]

TYPE_MAPPING = {
    "normal": "Normal", "fire": "Fire", "water": "Water", "electric": "Electric",
    "grass": "Grass", "ice": "Ice", "fighting": "Fighting", "poison": "Poison",
    "ground": "Ground", "flying": "Flying", "psychic": "Psychic", "bug": "Bug",
    "rock": "Rock", "ghost": "Ghost", "dragon": "Dragon", "dark": "Dark",
    "steel": "Steel", "fairy": "Fairy",
}


def fetch_json(url: str, retries=3) -> dict:
    for i in range(retries):
        try:
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 404:
                return None
        except Exception as e:
            if i == retries - 1:
                print(f"Failed to fetch {url}: {e}")
                return None
            time.sleep(1)
    return None


def parse_pokemon_data(data: dict) -> dict | None:
    if not data:
        return None

    stats = {s["stat"]["name"]: s["base_stat"] for s in data["stats"]}
    types = [t["type"]["name"] for t in data["types"]]

    name = data["name"]
    is_mega = "-mega" in name
    is_regional = any(x in name for x in ["-alola", "-galar", "-hisui", "-paldea"])

    sprite_url = data.get("sprites", {}).get("front_default")
    artwork_url = (
        data.get("sprites", {})
        .get("other", {})
        .get("official-artwork", {})
        .get("front_default")
    )

    return {
        "pokedex_number": data["id"],
        "name": data["species"]["name"] if "species" in data else name,
        "forme_name": name,
        "is_mega": is_mega,
        "is_regional_variant": is_regional,
        "type1": TYPE_MAPPING.get(types[0], types[0].capitalize()),
        "type2": TYPE_MAPPING.get(types[1], types[1].capitalize()) if len(types) > 1 else None,
        "hp": stats.get("hp", 0),
        "atk": stats.get("attack", 0),
        "def_": stats.get("defense", 0),
        "spatk": stats.get("special-attack", 0),
        "spdef": stats.get("special-defense", 0),
        "spe": stats.get("speed", 0),
        "total": sum([
            stats.get("hp", 0), stats.get("attack", 0), stats.get("defense", 0),
            stats.get("special-attack", 0), stats.get("special-defense", 0),
            stats.get("speed", 0),
        ]),
        "sprite_url": sprite_url,
        "artwork_url": artwork_url,
    }


def seed_pokemon(db: Session):
    print("Starting Pokemon seed...")

    seeded = 0
    skipped = 0

    # Fetch Gen 9 Pokemon
    print(f"Fetching Gen 9 Pokemon (IDs {GEN9_RANGE.start}-{GEN9_RANGE.stop - 1})...")
    for dex_num in GEN9_RANGE:
        data = fetch_json(f"{BASE_URL}/pokemon/{dex_num}")
        if not data:
            continue

        parsed = parse_pokemon_data(data)
        if not parsed:
            continue

        existing = db.query(PokemonSpecies).filter_by(
            pokedex_number=parsed["pokedex_number"],
            forme_name=parsed["forme_name"]
        ).first()

        if existing:
            skipped += 1
            continue

        species = PokemonSpecies(
            pokedex_number=parsed["pokedex_number"],
            name=parsed["name"],
            forme_name=parsed["forme_name"],
            is_base_forme=True,
            is_mega=parsed["is_mega"],
            is_regional_variant=parsed["is_regional_variant"],
            type1=parsed["type1"],
            type2=parsed["type2"],
            hp=parsed["hp"],
            def_=parsed["def_"],
            atk=parsed["atk"],
            spatk=parsed["spatk"],
            spdef=parsed["spdef"],
            spe=parsed["spe"],
            total=parsed["total"],
            sprite_url=parsed["sprite_url"],
            artwork_url=parsed["artwork_url"],
            generation=9,
        )
        db.add(species)
        seeded += 1

        if seeded % 20 == 0:
            db.commit()
            print(f"  Seeded {seeded} Pokemon...")

    db.commit()
    print(f"Gen 9 complete: {seeded} seeded, {skipped} skipped")

    # Seed some Gen 1-8 base Pokemon that are VGC legal
    print("Fetching common VGC-legal base Pokemon...")
    common_pokemon = list(range(1, 252)) + list(range(252, 387)) + list(range(387, 494))
    for dex_num in common_pokemon:
        data = fetch_json(f"{BASE_URL}/pokemon/{dex_num}")
        if not data:
            continue
        parsed = parse_pokemon_data(data)
        if not parsed:
            continue

        existing = db.query(PokemonSpecies).filter_by(
            pokedex_number=parsed["pokedex_number"],
            forme_name=parsed["forme_name"]
        ).first()

        if existing:
            continue

        gen = 1
        if dex_num > 493:
            gen = 5
        elif dex_num > 386:
            gen = 4
        elif dex_num > 251:
            gen = 3
        elif dex_num > 151:
            gen = 2

        species = PokemonSpecies(
            pokedex_number=parsed["pokedex_number"],
            name=parsed["name"],
            forme_name=parsed["forme_name"],
            is_base_forme=True,
            is_mega=False,
            is_regional_variant=False,
            type1=parsed["type1"],
            type2=parsed["type2"],
            hp=parsed["hp"],
            def_=parsed["def_"],
            atk=parsed["atk"],
            spatk=parsed["spatk"],
            spdef=parsed["spdef"],
            spe=parsed["spe"],
            total=parsed["total"],
            sprite_url=parsed["sprite_url"],
            artwork_url=parsed["artwork_url"],
            generation=gen,
        )
        db.add(species)
        seeded += 1

        if seeded % 50 == 0:
            db.commit()
            print(f"  Total seeded: {seeded}")

    db.commit()
    print(f"Seed complete! Total: {seeded} Pokemon seeded, {skipped} skipped")


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_pokemon(db)
    finally:
        db.close()

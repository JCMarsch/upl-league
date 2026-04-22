"""
Fetches all Pokemon from PokeAPI and upserts into pokemon_species.
Used by both the admin API endpoint and the seed script.
"""
import requests
import time
from sqlalchemy.orm import Session
from app.models.pokemon import PokemonSpecies

BASE_URL = "https://pokeapi.co/api/v2"

TYPE_MAP = {
    "normal": "Normal", "fire": "Fire", "water": "Water", "electric": "Electric",
    "grass": "Grass", "ice": "Ice", "fighting": "Fighting", "poison": "Poison",
    "ground": "Ground", "flying": "Flying", "psychic": "Psychic", "bug": "Bug",
    "rock": "Rock", "ghost": "Ghost", "dragon": "Dragon", "dark": "Dark",
    "steel": "Steel", "fairy": "Fairy",
}

REG_M_A_LEGAL: set[str] = {
    "venusaur", "charizard", "blastoise", "beedrill", "pidgeot", "arbok",
    "pikachu", "raichu", "clefable", "ninetales", "arcanine", "alakazam",
    "machamp", "victreebel", "slowbro", "gengar", "kangaskhan", "starmie",
    "pinsir", "tauros", "gyarados", "ditto", "vaporeon", "jolteon", "flareon",
    "aerodactyl", "snorlax", "dragonite",
    "meganium", "typhlosion", "feraligatr", "ariados", "ampharos", "azumarill",
    "politoed", "espeon", "umbreon", "slowking", "forretress", "steelix",
    "scizor", "heracross", "skarmory", "houndoom", "tyranitar",
    "pelipper", "gardevoir", "sableye", "aggron", "medicham", "manectric",
    "sharpedo", "camerupt", "torkoal", "altaria", "milotic", "castform",
    "banette", "chimecho", "absol", "glalie",
    "torterra", "infernape", "empoleon", "luxray", "roserade", "rampardos",
    "bastiodon", "lopunny", "spiritomb", "garchomp", "lucario", "hippowdon",
    "toxicroak", "abomasnow", "weavile", "rhyperior", "leafeon", "glaceon",
    "gliscor", "mamoswine", "gallade", "froslass", "rotom",
    "serperior", "emboar", "samurott", "watchog", "liepard", "simisage",
    "simisear", "simipour", "excadrill", "audino", "conkeldurr", "whimsicott",
    "krookodile", "cofagrigus", "garbodor", "zoroark", "reuniclus", "vanilluxe",
    "emolga", "chandelure", "beartic", "stunfisk", "golurk", "hydreigon", "volcarona",
    "chesnaught", "delphox", "greninja", "diggersby", "talonflame", "vivillon",
    "floette", "florges", "pangoro", "furfrou", "meowstic", "aegislash",
    "aromatisse", "slurpuff", "clawitzer", "heliolisk", "tyrantrum", "aurorus",
    "sylveon", "hawlucha", "dedenne", "goodra", "klefki", "trevenant",
    "gourgeist", "avalugg", "noivern",
    "decidueye", "incineroar", "primarina", "toucannon", "crabominable",
    "lycanroc", "toxapex", "mudsdale", "araquanid", "salazzle", "tsareena",
    "oranguru", "passimian", "mimikyu", "drampa", "kommo-o",
    "corviknight", "flapple", "appletun", "sandaconda", "polteageist",
    "hatterene", "mr-rime", "runerigus", "alcremie", "morpeko", "dragapult",
    "wyrdeer", "kleavor", "basculegion", "sneasler",
    "meowscarada", "skeledirge", "quaquaval", "maushold", "garganacl",
    "armarouge", "ceruledge", "bellibolt", "scovillain", "espathra",
    "tinkaton", "palafin", "orthworm", "glimmora", "farigiraf", "kingambit",
    "sinistcha", "archaludon", "hydrapple",
}

SKIP_EXACT: set[str] = {
    "wishiwashi-school", "palafin-hero", "zacian-crowned", "zamazenta-crowned",
    "darmanitan-zen", "darmanitan-galar-zen", "aegislash-blade", "mimikyu-busted",
    "cramorant-gulping", "cramorant-gorging", "eiscue-noice", "morpeko-hangry",
    "eternatus-eternamax", "necrozma-ultra", "cherrim-sunshine", "terapagos-stellar",
    "xerneas-active",
    "deerling-summer", "deerling-autumn", "deerling-winter",
    "sawsbuck-summer", "sawsbuck-autumn", "sawsbuck-winter",
    "flabebe-blue", "flabebe-orange", "flabebe-white", "flabebe-yellow",
    "floette-blue", "floette-orange", "floette-white", "floette-yellow",
    "florges-blue", "florges-orange", "florges-white", "florges-yellow",
    "shellos-east", "gastrodon-east",
    "basculin-blue-striped", "basiculin-blue-striped", "basculin-white-striped",
    "toxtricity-low-key", "maushold-family-of-four", "dudunsparce-three-segment",
    "squawkabilly-blue", "squawkabilly-yellow", "squawkabilly-white",
    "tatsugiri-droopy", "tatsugiri-stretchy",
    "minior-orange-meteor", "minior-yellow-meteor", "minior-green-meteor",
    "minior-blue-meteor", "minior-indigo-meteor", "minior-violet-meteor",
    "minior-orange-core", "minior-yellow-core", "minior-green-core",
    "minior-blue-core", "minior-indigo-core", "minior-violet-core",
    "pumpkaboo-small", "pumpkaboo-large", "pumpkaboo-super",
    "gourgeist-small", "gourgeist-large", "gourgeist-super",
    "koraidon-limited-build", "koraidon-daily-build", "koraidon-sprinting-build",
    "koraidon-swimming-build", "koraidon-gliding-build",
    "miraidon-low-power-mode", "miraidon-drive-mode",
    "miraidon-aquatic-mode", "miraidon-glide-mode",
}

SKIP_PREFIXES: tuple[str, ...] = (
    "vivillon-", "alcremie-", "furfrou-", "unown-", "spewpa-", "scatterbug-",
)


def _should_skip(slug: str) -> bool:
    if slug in SKIP_EXACT:
        return True
    return any(slug.startswith(p) for p in SKIP_PREFIXES)


def _get_generation(dex_num: int) -> int:
    if dex_num <= 151: return 1
    if dex_num <= 251: return 2
    if dex_num <= 386: return 3
    if dex_num <= 493: return 4
    if dex_num <= 649: return 5
    if dex_num <= 721: return 6
    if dex_num <= 809: return 7
    if dex_num <= 905: return 8
    return 9


def _fetch(url: str, retries: int = 3) -> dict | None:
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=15)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 404:
                return None
        except Exception:
            if attempt == retries - 1:
                return None
            time.sleep(1)
    return None


def _upsert(db: Session, slug: str, data: dict) -> str:
    stats = {s["stat"]["name"]: s["base_stat"] for s in data["stats"]}
    types = [t["type"]["name"] for t in data["types"]]
    species_name = data["species"]["name"]
    dex_num = int(data["species"]["url"].rstrip("/").split("/")[-1])

    sprites = data.get("sprites", {})
    other = sprites.get("other", {})
    artwork = other.get("official-artwork", {})

    hp = stats.get("hp", 0)
    atk = stats.get("attack", 0)
    def_ = stats.get("defense", 0)
    spatk = stats.get("special-attack", 0)
    spdef = stats.get("special-defense", 0)
    spe = stats.get("speed", 0)

    fields = dict(
        pokedex_number=dex_num,
        name=species_name,
        is_base_forme=(slug == species_name),
        is_mega="-mega" in slug,
        is_regional_variant=any(slug.endswith(s) for s in ["-alola", "-galar", "-hisui", "-paldea"]),
        type1=TYPE_MAP.get(types[0], types[0].capitalize()),
        type2=TYPE_MAP.get(types[1], types[1].capitalize()) if len(types) > 1 else None,
        hp=hp, atk=atk, def_=def_, spatk=spatk, spdef=spdef, spe=spe,
        total=hp + atk + def_ + spatk + spdef + spe,
        sprite_url=sprites.get("front_default"),
        artwork_url=artwork.get("front_default"),
        shiny_sprite_url=sprites.get("front_shiny"),
        shiny_artwork_url=artwork.get("front_shiny"),
        format_legality={"reg-m-a": species_name in REG_M_A_LEGAL},
        generation=_get_generation(dex_num),
    )

    existing = db.query(PokemonSpecies).filter_by(forme_name=slug).first()
    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
        return "updated"
    else:
        db.add(PokemonSpecies(forme_name=slug, can_coexist_with=[], **fields))
        return "created"


def run_seed(db: Session, progress_cb=None) -> dict:
    """
    Fetch all Pokemon from PokeAPI and upsert into pokemon_species.
    progress_cb(done, total) called every 50 records if provided.
    Returns {"created": int, "updated": int, "errors": int, "skipped": int}.
    """
    list_data = _fetch(f"{BASE_URL}/pokemon?limit=10000")
    if not list_data:
        raise RuntimeError("Could not fetch Pokemon list from PokeAPI")

    all_slugs = [e["name"] for e in list_data["results"]]
    to_process = [s for s in all_slugs if not _should_skip(s)]
    skipped = len(all_slugs) - len(to_process)

    created = updated = errors = 0
    for i, slug in enumerate(to_process):
        data = _fetch(f"{BASE_URL}/pokemon/{slug}")
        if not data:
            errors += 1
            continue
        result = _upsert(db, slug, data)
        if result == "created":
            created += 1
        else:
            updated += 1

        if (i + 1) % 50 == 0:
            db.commit()
            if progress_cb:
                progress_cb(i + 1, len(to_process))

    db.commit()
    return {"created": created, "updated": updated, "errors": errors, "skipped": skipped}

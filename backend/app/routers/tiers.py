from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone
from app.database import get_db
from app.auth import require_admin
from app.models.season import Season
from app.models.pokemon import SeasonPokemon, PokemonSpecies
from app.models.config import LeagueConfig
from app.models.user import User
from app.schemas.pokemon import BulkPokemonUpdate, SeasonPokemonOut
from typing import List, Dict, Optional

# Pokemon Champions Regulation M-A legal species (base species names matching PokeAPI slugs)
# Source: https://www.serebii.net/pokedex-champions/
# Mega evolutions of these species are automatically legal via the name-matching logic
REG_M_A_LEGAL: set[str] = {
    # Kanto
    "venusaur", "charizard", "blastoise", "beedrill", "pidgeot", "arbok",
    "pikachu", "raichu", "clefable", "ninetales", "arcanine", "alakazam",
    "machamp", "victreebel", "slowbro", "gengar", "kangaskhan", "starmie",
    "pinsir", "tauros", "gyarados", "ditto", "vaporeon", "jolteon", "flareon",
    "aerodactyl", "snorlax", "dragonite",
    # Johto
    "meganium", "typhlosion", "feraligatr", "ariados", "ampharos", "azumarill",
    "politoed", "espeon", "umbreon", "slowking", "forretress", "steelix",
    "scizor", "heracross", "skarmory", "houndoom", "tyranitar",
    # Hoenn
    "pelipper", "gardevoir", "sableye", "aggron", "medicham", "manectric",
    "sharpedo", "camerupt", "torkoal", "altaria", "milotic", "castform",
    "banette", "chimecho", "absol", "glalie",
    # Sinnoh
    "torterra", "infernape", "empoleon", "luxray", "roserade", "rampardos",
    "bastiodon", "lopunny", "spiritomb", "garchomp", "lucario", "hippowdon",
    "toxicroak", "abomasnow", "weavile", "rhyperior", "leafeon", "glaceon",
    "gliscor", "mamoswine", "gallade", "froslass", "rotom",
    # Unova
    "serperior", "emboar", "samurott", "watchog", "liepard", "simisage",
    "simisear", "simipour", "excadrill", "audino", "conkeldurr", "whimsicott",
    "krookodile", "cofagrigus", "garbodor", "zoroark", "reuniclus", "vanilluxe",
    "emolga", "chandelure", "beartic", "stunfisk", "golurk", "hydreigon", "volcarona",
    # Kalos
    "chesnaught", "delphox", "greninja", "diggersby", "talonflame", "vivillon",
    "floette", "florges", "pangoro", "furfrou", "meowstic", "aegislash",
    "aromatisse", "slurpuff", "clawitzer", "heliolisk", "tyrantrum", "aurorus",
    "sylveon", "hawlucha", "dedenne", "goodra", "klefki", "trevenant",
    "gourgeist", "avalugg", "noivern",
    # Alola
    "decidueye", "incineroar", "primarina", "toucannon", "crabominable",
    "lycanroc", "toxapex", "mudsdale", "araquanid", "salazzle", "tsareena",
    "oranguru", "passimian", "mimikyu", "drampa", "kommo-o",
    # Galar / Hisui
    "corviknight", "flapple", "appletun", "sandaconda", "polteageist",
    "hatterene", "mr-rime", "runerigus", "alcremie", "morpeko", "dragapult",
    "wyrdeer", "kleavor", "basculegion", "sneasler",
    # Paldea
    "meowscarada", "skeledirge", "quaquaval", "maushold", "garganacl",
    "armarouge", "ceruledge", "bellibolt", "scovillain", "espathra",
    "tinkaton", "palafin", "orthworm", "glimmora", "farigiraf", "kingambit",
    "sinistcha", "archaludon", "hydrapple",
}

REGULATION_LEGAL: dict[str, set[str]] = {
    "reg-m-a": REG_M_A_LEGAL,
}

router = APIRouter(tags=["tiers"])


@router.get("/seasons/{season_id}/pokemon", response_model=List[SeasonPokemonOut])
def list_season_pokemon(season_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(SeasonPokemon)
        .filter(SeasonPokemon.season_id == season_id)
        .options(joinedload(SeasonPokemon.species))
        .order_by(SeasonPokemon.species_id)
        .all()
    )
    return [
        SeasonPokemonOut(
            id=sp.id,
            season_id=sp.season_id,
            species_id=sp.species_id,
            tier=sp.tier,
            point_cost=sp.point_cost,
            is_legal=sp.is_legal,
            drafted_by_team_id=sp.drafted_by_team_id,
            species_name=sp.species.name if sp.species else None,
            species_forme_name=sp.species.forme_name if sp.species else None,
            species_sprite_url=sp.species.sprite_url if sp.species else None,
            species_artwork_url=sp.species.artwork_url if sp.species else None,
            species_shiny_sprite_url=sp.species.shiny_sprite_url if sp.species else None,
            species_shiny_artwork_url=sp.species.shiny_artwork_url if sp.species else None,
            species_type1=sp.species.type1 if sp.species else None,
            species_type2=sp.species.type2 if sp.species else None,
            is_mega=sp.species.is_mega if sp.species else None,
            format_legality=sp.species.format_legality if sp.species else None,
        )
        for sp in rows
    ]


@router.post("/seasons/{season_id}/pokemon/populate")
def populate_season_pokemon(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    all_species = db.query(PokemonSpecies).all()
    existing_ids = {sp.species_id for sp in db.query(SeasonPokemon).filter(SeasonPokemon.season_id == season_id).all()}

    created = 0
    for species in all_species:
        if species.id not in existing_ids:
            db.add(SeasonPokemon(season_id=season_id, species_id=species.id, is_legal=True))
            created += 1

    db.commit()
    return {"created": created, "total": len(all_species)}


@router.post("/seasons/{season_id}/pokemon/apply-regulation")
def apply_regulation(
    season_id: int,
    regulation: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if regulation not in REGULATION_LEGAL:
        raise HTTPException(status_code=400, detail=f"Unknown regulation '{regulation}'. Valid: {list(REGULATION_LEGAL)}")

    legal_species_names = REGULATION_LEGAL[regulation]

    legal_species_ids = {
        row.id
        for row in db.query(PokemonSpecies.id).filter(
            PokemonSpecies.name.in_(list(legal_species_names))
        ).all()
    }

    # Two bulk UPDATEs instead of row-by-row
    legal_count = db.query(SeasonPokemon).filter(
        SeasonPokemon.season_id == season_id,
        SeasonPokemon.species_id.in_(legal_species_ids),
    ).update({"is_legal": True}, synchronize_session=False)

    illegal_count = db.query(SeasonPokemon).filter(
        SeasonPokemon.season_id == season_id,
        SeasonPokemon.species_id.notin_(legal_species_ids),
    ).update({"is_legal": False}, synchronize_session=False)

    db.commit()
    return {
        "regulation": regulation,
        "legal": legal_count,
        "illegal": illegal_count,
        "total_in_regulation": len(legal_species_names),
    }


@router.post("/seasons/{season_id}/pokemon/bulk-update")
def bulk_update_pokemon(
    season_id: int,
    data: BulkPokemonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != "setup":
        raise HTTPException(status_code=403, detail="Tiers can only be edited during setup")

    updated = []
    for update in data.updates:
        sp = db.query(SeasonPokemon).filter(
            SeasonPokemon.season_id == season_id,
            SeasonPokemon.species_id == update.species_id,
        ).first()
        if not sp:
            # Create if doesn't exist
            sp = SeasonPokemon(season_id=season_id, species_id=update.species_id)
            db.add(sp)
        if "tier" in update.model_fields_set:
            sp.tier = update.tier
        if "point_cost" in update.model_fields_set:
            sp.point_cost = update.point_cost
        if "is_legal" in update.model_fields_set:
            sp.is_legal = update.is_legal
        updated.append(update.species_id)

    db.commit()
    return {"updated": len(updated), "species_ids": updated}


TIERS = ["S", "A", "B", "C", "D", "Free"]


def _get_tier_config(season_id: int, db: Session) -> Dict[str, Dict[str, Optional[int]]]:
    rows = db.query(LeagueConfig).filter(
        LeagueConfig.season_id == season_id,
        LeagueConfig.key.in_([f"tier_cost_{t}" for t in TIERS] + [f"mega_tier_cost_{t}" for t in TIERS]),
    ).all()
    config: Dict[str, Dict[str, Optional[int]]] = {
        "regular": {t: None for t in TIERS},
        "mega": {t: None for t in TIERS},
    }
    for row in rows:
        if row.key.startswith("mega_tier_cost_"):
            tier = row.key[len("mega_tier_cost_"):]
            config["mega"][tier] = int(row.value) if row.value is not None else None
        elif row.key.startswith("tier_cost_"):
            tier = row.key[len("tier_cost_"):]
            config["regular"][tier] = int(row.value) if row.value is not None else None
    return config


@router.get("/seasons/{season_id}/tier-config")
def get_tier_config(season_id: int, db: Session = Depends(get_db)):
    return _get_tier_config(season_id, db)


@router.post("/seasons/{season_id}/tier-config")
def set_tier_config(
    season_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    regular = body.get("regular", {})
    mega = body.get("mega", {})

    def upsert(key: str, value: Optional[int]):
        row = db.query(LeagueConfig).filter(
            LeagueConfig.season_id == season_id,
            LeagueConfig.key == key,
        ).first()
        if row:
            row.value = str(value) if value is not None else None
            row.updated_by_id = current_user.id
        else:
            db.add(LeagueConfig(season_id=season_id, key=key, value=str(value) if value is not None else None, updated_by_id=current_user.id))

    for tier in TIERS:
        if tier in regular:
            upsert(f"tier_cost_{tier}", regular[tier])
        if tier in mega:
            upsert(f"mega_tier_cost_{tier}", mega[tier])

    db.commit()
    return _get_tier_config(season_id, db)


@router.post("/seasons/{season_id}/lock-tiers")
def lock_tiers(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if season.status != "setup":
        raise HTTPException(status_code=400, detail="Season is not in setup status")

    # Check for any legal pokemon missing tier assignments
    missing = db.query(SeasonPokemon).filter(
        SeasonPokemon.season_id == season_id,
        SeasonPokemon.is_legal == True,
        SeasonPokemon.tier == None,
    ).count()
    if missing > 0:
        raise HTTPException(
            status_code=400,
            detail=f"{missing} legal Pokemon are missing tier assignments",
        )

    now = datetime.now(timezone.utc)
    db.query(SeasonPokemon).filter(SeasonPokemon.season_id == season_id).update(
        {"locked_at": now}
    )
    season.status = "draft"
    db.commit()
    return {"message": "Tiers locked", "season_status": season.status}

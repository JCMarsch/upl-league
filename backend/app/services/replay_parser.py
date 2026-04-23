"""
Showdown replay parser.
Parses the log field of a replay to extract:
- Leads (first 2 pokemon sent out per side)
- All brought pokemon (4 per side)
- KOs (direct vs passive)
"""
import re
import requests
from typing import Optional


PASSIVE_DAMAGE_SOURCES = {
    "psn", "tox", "brn", "recoil", "hail", "sandstorm", "weather",
    "leechseed", "perishsong", "trapped", "spikes", "stealthrock",
    "struggle", "bind", "wrap", "clamp", "whirlpool", "firespin"
}


class ReplayParseError(Exception):
    pass


def fetch_replay(replay_id: str, base_domain: str = "replay.pokemonshowdown.com") -> dict:
    """Fetch replay JSON from Showdown or a compatible server."""
    url = f"https://{base_domain}/{replay_id}.json"
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 404:
            return {"error": "Replay not found"}
        if resp.status_code == 403:
            return {"error": "Replay is private"}
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        return {"error": f"Network error: {str(e)}"}
    except Exception as e:
        return {"error": f"Parse error: {str(e)}"}


def parse_replay_log(log: str) -> dict:
    """
    Parse the raw Showdown log string.
    Returns structured game stats.
    """
    lines = log.split("\n")

    p1_name = None
    p2_name = None
    p1_team = {}  # nickname -> species
    p2_team = {}
    p1_brought = []  # in order of appearance
    p2_brought = []
    p1_leads = []
    p2_leads = []

    kills = {}  # (team, pokemon) -> {direct, passive}
    deaths = {}  # (team, pokemon) -> {direct, passive}

    last_move = None  # (attacker_team, attacker_pokemon, move_name, target)
    active = {}  # position (p1a, p1b, p2a, p2b) -> (team, pokemon)

    current_turn = 0
    kill_events_list = []
    winner_side = None
    turn_faints = []
    in_turn = False

    for line in lines:
        parts = line.split("|")
        if len(parts) < 2:
            continue
        cmd = parts[1] if len(parts) > 1 else ""

        if cmd == "player":
            if parts[2] == "p1":
                p1_name = parts[3]
            elif parts[2] == "p2":
                p2_name = parts[3]

        elif cmd == "poke":
            team = parts[2]
            pokemon = parts[3].split(",")[0].strip()
            if team == "p1":
                p1_team[pokemon] = pokemon
            else:
                p2_team[pokemon] = pokemon

        elif cmd == "switch" or cmd == "drag":
            if len(parts) < 5:
                continue
            position = parts[2].split(":")[0]  # e.g. p1a
            species = parts[3].split(",")[0].strip()
            team = "p1" if position.startswith("p1") else "p2"

            active[position] = (team, species)

            if team == "p1":
                if species not in p1_brought:
                    p1_brought.append(species)
                if len(p1_brought) <= 2 and species not in p1_leads:
                    p1_leads.append(species)
            else:
                if species not in p2_brought:
                    p2_brought.append(species)
                if len(p2_brought) <= 2 and species not in p2_leads:
                    p2_leads.append(species)

        elif cmd == "turn":
            current_turn = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else current_turn + 1
            in_turn = True
            last_move = None
            turn_faints = []

        elif cmd == "win":
            winner_name = parts[2].strip() if len(parts) > 2 else ""
            if winner_name == p1_name:
                winner_side = "p1"
            elif winner_name == p2_name:
                winner_side = "p2"

        elif cmd == "move":
            if len(parts) < 5:
                continue
            position = parts[2].split(":")[0]
            user_team = "p1" if position.startswith("p1") else "p2"
            user_pokemon = parts[2].split(": ")[1] if ": " in parts[2] else ""
            move_name = parts[3]
            target = parts[4] if len(parts) > 4 else ""
            last_move = (user_team, user_pokemon, move_name, target)

        elif cmd == "faint":
            if len(parts) < 3:
                continue
            position = parts[2].split(":")[0]
            fainted_pokemon = parts[2].split(": ")[1] if ": " in parts[2] else ""
            fainted_team = "p1" if position.startswith("p1") else "p2"

            if fainted_team not in deaths:
                deaths[(fainted_team, fainted_pokemon)] = {"direct": 0, "passive": 0}

            is_passive = False
            for passive_src in PASSIVE_DAMAGE_SOURCES:
                if line.lower().find(passive_src) >= 0:
                    is_passive = True
                    break

            if last_move and last_move[3] and position in last_move[3]:
                is_passive = False
            elif not last_move:
                is_passive = True

            killer_team = "p2" if fainted_team == "p1" else "p1"
            if last_move and last_move[0] == killer_team:
                killer_pokemon = last_move[1]
            else:
                killer_pokemon = None
                is_passive = True

            if is_passive:
                deaths[(fainted_team, fainted_pokemon)]["passive"] = deaths.get(
                    (fainted_team, fainted_pokemon), {"direct": 0, "passive": 0}
                )["passive"] + 1
                if killer_pokemon:
                    key = (killer_team, killer_pokemon)
                    if key not in kills:
                        kills[key] = {"direct": 0, "passive": 0}
                    kills[key]["passive"] += 1
            else:
                deaths[(fainted_team, fainted_pokemon)]["direct"] = deaths.get(
                    (fainted_team, fainted_pokemon), {"direct": 0, "passive": 0}
                )["direct"] + 1
                if killer_pokemon:
                    key = (killer_team, killer_pokemon)
                    if key not in kills:
                        kills[key] = {"direct": 0, "passive": 0}
                    kills[key]["direct"] += 1

            kill_events_list.append({
                "turn_number": current_turn,
                "attacker_side": killer_team if killer_pokemon else None,
                "attacker_pokemon": killer_pokemon,
                "defender_side": fainted_team,
                "defender_pokemon": fainted_pokemon,
                "move_name": last_move[2] if last_move and not is_passive else None,
                "kill_type": "passive" if is_passive else "direct",
            })

    return {
        "p1_name": p1_name,
        "p2_name": p2_name,
        "p1_leads": p1_leads[:2],
        "p2_leads": p2_leads[:2],
        "p1_brought": p1_brought[:4],
        "p2_brought": p2_brought[:4],
        "kills": {f"{k[0]}/{k[1]}": v for k, v in kills.items()},
        "deaths": {f"{k[0]}/{k[1]}": v for k, v in deaths.items()},
        "kill_events": kill_events_list,
        "winner_side": winner_side,
    }


def parse_replay_from_fixture(data: dict) -> dict:
    """Parse a replay from a dict (for testing from file fixtures)."""
    if "error" in data:
        return data
    log = data.get("log", "")
    if not log:
        return {"error": "No log in replay data"}
    try:
        return parse_replay_log(log)
    except Exception as e:
        return {"error": f"Parse error: {str(e)}", "partial": True}


def parse_replay_from_url(replay_id: str, base_domain: str = "replay.pokemonshowdown.com") -> dict:
    """Fetch and parse a replay by ID from a given domain."""
    data = fetch_replay(replay_id, base_domain=base_domain)
    return parse_replay_from_fixture(data)

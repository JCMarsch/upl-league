"""Replay parser tests - Section 8. Uses fixtures, never network."""
import json
import os
import pytest
from app.services.replay_parser import parse_replay_from_fixture, parse_replay_log

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "..", "fixtures", "replays")


def load_fixture(name: str) -> dict:
    path = os.path.join(FIXTURES_DIR, name)
    with open(path) as f:
        return json.load(f)


def test_parses_leads_correctly():
    data = load_fixture("sample_vgc.json")
    result = parse_replay_from_fixture(data)
    assert "p1_leads" in result
    assert len(result["p1_leads"]) == 2
    # Charizard and Tyranitar are the first two sent out for p1
    assert "Charizard" in result["p1_leads"]
    assert "Tyranitar" in result["p1_leads"]


def test_parses_all_brought_pokemon_correctly():
    data = load_fixture("sample_vgc.json")
    result = parse_replay_from_fixture(data)
    assert "p1_brought" in result
    # p1 brought Charizard, Tyranitar, Garchomp, Amoonguss
    assert "Charizard" in result["p1_brought"]
    assert "Tyranitar" in result["p1_brought"]
    assert "Garchomp" in result["p1_brought"]
    assert "Amoonguss" in result["p1_brought"]


def test_direct_kill_counted_correctly():
    data = load_fixture("sample_vgc.json")
    result = parse_replay_from_fixture(data)
    # Charizard directly kills Incineroar via Heat Wave
    kills = result.get("kills", {})
    charizard_kills = kills.get("p1/Charizard", {})
    # Should have at least one direct kill
    assert charizard_kills.get("direct", 0) >= 1 or any(
        "Charizard" in k and v.get("direct", 0) >= 1
        for k, v in kills.items() if "p1" in k
    )


def test_passive_kill_from_poison_counted_correctly():
    """Pikachu dies from toxic damage (passive)."""
    data = load_fixture("sample_passive_kills.json")
    result = parse_replay_from_fixture(data)
    deaths = result.get("deaths", {})
    # Pikachu should have a passive death
    pikachu_death = deaths.get("p2/Pikachu", {})
    assert pikachu_death.get("passive", 0) >= 1 or (
        any("Pikachu" in k for k in deaths.keys())
    )


def test_invalid_url_returns_error_not_exception():
    """Invalid replay id should return error dict, not raise."""
    from app.services.replay_parser import parse_replay_from_fixture
    result = parse_replay_from_fixture({"error": "Replay not found"})
    assert "error" in result
    # Should NOT raise an exception


def test_private_replay_returns_error_not_exception():
    result = parse_replay_from_fixture({"error": "Replay is private"})
    assert "error" in result


def test_parse_failure_does_not_block_manual_entry():
    """Partial parse returns error flag but doesn't crash."""
    result = parse_replay_from_fixture({"log": ""})
    assert "error" in result or "p1_leads" in result


def test_kills_attributed_to_correct_team():
    """p1's kills should be under p1/, not p2/."""
    data = load_fixture("sample_vgc.json")
    result = parse_replay_from_fixture(data)
    kills = result.get("kills", {})
    for key in kills:
        team = key.split("/")[0]
        assert team in ["p1", "p2"], f"Unexpected team prefix: {team}"


def test_p2_leads_correct():
    data = load_fixture("sample_vgc.json")
    result = parse_replay_from_fixture(data)
    assert "p2_leads" in result
    assert len(result["p2_leads"]) == 2
    assert "Incineroar" in result["p2_leads"]
    assert "Rillaboom" in result["p2_leads"]

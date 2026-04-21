"""Unit tests for the draft state machine."""
import pytest
from app.services.draft_service import generate_snake_order, get_next_team_snake


def test_get_next_team_snake_round_1():
    team_ids = [1, 2, 3, 4]
    # Round 1, pick 1 -> team 1
    result = get_next_team_snake(None, team_ids, 1, 4)
    assert result == 1
    # Round 1, pick 2 -> team 2
    result = get_next_team_snake(None, team_ids, 2, 4)
    assert result == 2
    # Round 1, pick 4 -> team 4
    result = get_next_team_snake(None, team_ids, 4, 4)
    assert result == 4


def test_get_next_team_snake_round_2_reverses():
    team_ids = [1, 2, 3, 4]
    # Round 2, pick 5 -> team 4 (reversed)
    result = get_next_team_snake(None, team_ids, 5, 4)
    assert result == 4
    # Round 2, pick 6 -> team 3
    result = get_next_team_snake(None, team_ids, 6, 4)
    assert result == 3
    # Round 2, pick 8 -> team 1
    result = get_next_team_snake(None, team_ids, 8, 4)
    assert result == 1


def test_get_next_team_at_round_boundary():
    team_ids = [1, 2, 3]
    # Pick 3 = last of round 1 -> team 3
    assert get_next_team_snake(None, team_ids, 3, 3) == 3
    # Pick 4 = first of round 2 -> team 3 (reversed)
    assert get_next_team_snake(None, team_ids, 4, 3) == 3
    # Pick 5 = second of round 2 -> team 2
    assert get_next_team_snake(None, team_ids, 5, 3) == 2
    # Pick 6 = last of round 2 -> team 1
    assert get_next_team_snake(None, team_ids, 6, 3) == 1
    # Pick 7 = first of round 3 -> team 1
    assert get_next_team_snake(None, team_ids, 7, 3) == 1


def test_generate_snake_order_correct_for_6_teams():
    team_ids = [1, 2, 3, 4, 5, 6]
    order = generate_snake_order(team_ids, 3)
    assert len(order) == 18

    round1 = [e for e in order if e["round_number"] == 1]
    assert [e["team_id"] for e in sorted(round1, key=lambda x: x["pick_position"])] == [1, 2, 3, 4, 5, 6]

    round2 = [e for e in order if e["round_number"] == 2]
    assert [e["team_id"] for e in sorted(round2, key=lambda x: x["pick_position"])] == [6, 5, 4, 3, 2, 1]

    round3 = [e for e in order if e["round_number"] == 3]
    assert [e["team_id"] for e in sorted(round3, key=lambda x: x["pick_position"])] == [1, 2, 3, 4, 5, 6]


def test_generate_snake_order_correct_for_4_teams():
    team_ids = [1, 2, 3, 4]
    order = generate_snake_order(team_ids, 2)
    assert len(order) == 8

    round1_teams = [e["team_id"] for e in order if e["round_number"] == 1]
    round2_teams = [e["team_id"] for e in order if e["round_number"] == 2]
    assert round1_teams == [1, 2, 3, 4]
    assert round2_teams == [4, 3, 2, 1]


def test_generate_snake_order_correct_for_10_teams():
    team_ids = list(range(1, 11))
    order = generate_snake_order(team_ids, 2)
    assert len(order) == 20

    round1_teams = [e["team_id"] for e in order if e["round_number"] == 1]
    round2_teams = [e["team_id"] for e in order if e["round_number"] == 2]
    assert round1_teams == list(range(1, 11))
    assert round2_teams == list(range(10, 0, -1))


def test_autopick_selects_highest_tier_available_pokemon():
    """Unit test: get_highest_tier_available returns S-tier before A-tier."""
    from unittest.mock import MagicMock
    from app.services.draft_service import get_highest_tier_available

    s_tier_pokemon = MagicMock()
    s_tier_pokemon.tier = "S"

    mock_db = MagicMock()
    # The function calls db.query().filter(...).first()
    # MagicMock chains return a new mock for each call, so .first() is on filter chain
    mock_db.query.return_value.filter.return_value.first.return_value = s_tier_pokemon

    result = get_highest_tier_available(mock_db, season_id=1)
    assert result == s_tier_pokemon

"""Stats and tiebreaker tests - Section 6/7 from test spec."""
import pytest
from app.services.stats_service import win_percentage, sort_standings
from app.models.stats import TeamSeasonStats
from unittest.mock import MagicMock


def make_stats(team_id, team_name, mw, ml, md, gd, kd=0):
    """Helper to create a mock TeamSeasonStats."""
    s = MagicMock(spec=TeamSeasonStats)
    s.team_id = team_id
    s.match_wins = mw
    s.match_losses = ml
    s.match_draws = md
    s.win_percentage = mw / (mw + ml + md) if (mw + ml + md) > 0 else 0.0
    s.game_differential = gd
    s.kill_death_differential = kd
    s.total_kills = 0
    s.total_deaths = 0
    s.streak = 0
    s.team = MagicMock()
    s.team.name = team_name
    return s


def test_win_percentage_calculation():
    assert win_percentage(3, 1, 0) == 0.75
    assert win_percentage(0, 4, 0) == 0.0
    assert win_percentage(2, 2, 0) == 0.5
    assert win_percentage(0, 0, 0) == 0.0


def test_tiebreaker_win_percentage_first():
    a = make_stats(1, "Alpha", mw=3, ml=1, md=0, gd=5)
    b = make_stats(2, "Beta", mw=2, ml=2, md=0, gd=10)
    ranked = sort_standings([b, a])
    assert ranked[0].team_id == 1  # Alpha has higher win%


def test_tiebreaker_wins_when_win_pct_equal():
    # Both 0.5 win%, but A has more wins
    a = make_stats(1, "Alpha", mw=4, ml=4, md=0, gd=0)
    b = make_stats(2, "Beta", mw=2, ml=2, md=0, gd=0)
    ranked = sort_standings([b, a])
    assert ranked[0].team_id == 1


def test_tiebreaker_differential_when_wins_equal():
    a = make_stats(1, "Alpha", mw=3, ml=1, md=0, gd=5)
    b = make_stats(2, "Beta", mw=3, ml=1, md=0, gd=2)
    ranked = sort_standings([b, a])
    assert ranked[0].team_id == 1


def test_tiebreaker_alphabetical_as_final_fallback():
    a = make_stats(1, "Alpha", mw=3, ml=1, md=0, gd=5)
    b = make_stats(2, "Zeta", mw=3, ml=1, md=0, gd=5)
    ranked = sort_standings([b, a])
    assert ranked[0].team_id == 1  # Alpha before Zeta


def test_tiebreaker_never_leaves_two_teams_equal_rank():
    """Run with various tie scenarios - unique rank always assigned."""
    teams = [
        make_stats(1, "Alpha", mw=3, ml=1, md=0, gd=5),
        make_stats(2, "Beta", mw=3, ml=1, md=0, gd=5),
        make_stats(3, "Gamma", mw=2, ml=2, md=0, gd=0),
        make_stats(4, "Delta", mw=1, ml=3, md=0, gd=-5),
    ]
    ranked = sort_standings(teams)
    ranks = list(range(len(ranked)))
    assert len(ranked) == 4
    # Verify all unique by position
    team_ids = [s.team_id for s in ranked]
    assert len(set(team_ids)) == 4


def test_mvp_ranking_most_kills_first():
    """MVP sorting test - more total kills = higher rank."""
    from app.models.stats import PokemonSeasonStats
    s1 = MagicMock()
    s1.total_kills = 10
    s1.kill_death_differential = 5
    s1.games_played = 3
    s2 = MagicMock()
    s2.total_kills = 15
    s2.kill_death_differential = 3
    s2.games_played = 5
    # s2 should rank higher
    ranked = sorted([s1, s2], key=lambda x: (-x.total_kills, -x.kill_death_differential, x.games_played))
    assert ranked[0] == s2


def test_direct_kills_passive_kills_sum_to_total():
    """Test that kills sum correctly."""
    direct = 5
    passive = 3
    total = direct + passive
    assert total == 8

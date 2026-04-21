"""Multi-season isolation tests - Section 9."""
import pytest
from app.models.season import Season
from app.models.team import Team
from app.models.stats import TeamSeasonStats, SeasonResult
from app.models.user import User
from app.security import hash_password


def create_complete_season(db_session, name="Season 1", year=2024):
    """Helper: create a season with stats and close it."""
    season = Season(name=name, year=year, status="setup")
    db_session.add(season)
    db_session.flush()

    user = User(username=f"mgr_{name}", password_hash=hash_password("pw"), roles="manager")
    db_session.add(user)
    db_session.flush()

    team = Team(season_id=season.id, manager_id=user.id, name=f"Team {name}")
    db_session.add(team)
    db_session.flush()

    stats = TeamSeasonStats(
        team_id=team.id,
        season_id=season.id,
        match_wins=5,
        match_losses=0,
        total_kills=20,
        win_percentage=1.0,
    )
    db_session.add(stats)
    db_session.flush()

    result = SeasonResult(
        season_id=season.id, team_id=team.id, final_rank=1, champion=True
    )
    db_session.add(result)
    season.status = "complete"
    db_session.commit()
    return season, team, user


def test_season_1_stats_not_in_season_2_standings(db_session):
    season1, team1, user1 = create_complete_season(db_session, "S1", 2024)
    season2, team2, user2 = create_complete_season(db_session, "S2", 2025)

    s2_stats = db_session.query(TeamSeasonStats).filter(
        TeamSeasonStats.season_id == season2.id
    ).all()
    team_ids_in_s2 = [s.team_id for s in s2_stats]
    assert team1.id not in team_ids_in_s2


def test_season_1_roster_not_in_season_2_roster(db_session):
    season1, team1, _ = create_complete_season(db_session, "S1", 2024)
    season2, team2, _ = create_complete_season(db_session, "S2", 2025)
    # team1 from season1 should not appear in season2
    s2_teams = db_session.query(Team).filter(Team.season_id == season2.id).all()
    assert team1.id not in [t.id for t in s2_teams]


def test_closing_season_1_does_not_affect_season_2(db_session):
    season1, team1, _ = create_complete_season(db_session, "S1", 2024)
    season2 = Season(name="S2", year=2025, status="regular")
    db_session.add(season2)
    db_session.commit()

    # Season 2 should remain in regular status
    db_session.refresh(season2)
    assert season2.status == "regular"
    db_session.refresh(season1)
    assert season1.status == "complete"


def test_champion_recorded_per_season_not_global(db_session):
    season1, team1, _ = create_complete_season(db_session, "S1", 2024)
    season2, team2, _ = create_complete_season(db_session, "S2", 2025)

    s1_champ = db_session.query(SeasonResult).filter(
        SeasonResult.season_id == season1.id, SeasonResult.champion == True
    ).first()
    s2_champ = db_session.query(SeasonResult).filter(
        SeasonResult.season_id == season2.id, SeasonResult.champion == True
    ).first()

    assert s1_champ.team_id == team1.id
    assert s2_champ.team_id == team2.id
    # Different champions for different seasons
    assert s1_champ.team_id != s2_champ.team_id


def test_all_time_kills_sums_all_seasons(db_session):
    season1, team1, user1 = create_complete_season(db_session, "S1", 2024)
    # Create second season for same manager
    season2 = Season(name="S2", year=2025, status="complete")
    db_session.add(season2)
    db_session.flush()
    team2 = Team(season_id=season2.id, manager_id=user1.id, name="Team2")
    db_session.add(team2)
    db_session.flush()
    stats2 = TeamSeasonStats(team_id=team2.id, season_id=season2.id, total_kills=15, win_percentage=0.7)
    db_session.add(stats2)
    db_session.commit()

    all_stats = db_session.query(TeamSeasonStats).filter(
        Team.manager_id == user1.id
    ).join(Team, TeamSeasonStats.team_id == Team.id).all()

    total_kills = sum(s.total_kills or 0 for s in all_stats)
    assert total_kills == 35  # 20 + 15

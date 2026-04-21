"""Stats calculation and standings tiebreaker logic."""
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.schedule import Match, GameStat
from app.models.stats import TeamSeasonStats, H2HRecord
from app.models.team import Team
from typing import List


def recalculate_team_stats(db: Session, season_id: int):
    """Recalculate all team stats for a season from confirmed matches."""
    teams = db.query(Team).filter(Team.season_id == season_id).all()

    for team in teams:
        stats = db.query(TeamSeasonStats).filter(
            TeamSeasonStats.team_id == team.id,
            TeamSeasonStats.season_id == season_id,
        ).first()
        if not stats:
            stats = TeamSeasonStats(team_id=team.id, season_id=season_id)
            db.add(stats)

        # Reset
        stats.wins = stats.losses = stats.draws = 0
        stats.match_wins = stats.match_losses = stats.match_draws = 0
        stats.game_differential = stats.match_differential = 0
        stats.direct_kills = stats.passive_kills = stats.total_kills = 0
        stats.direct_deaths = stats.passive_deaths = stats.total_deaths = 0

        confirmed = db.query(Match).filter(
            Match.season_id == season_id,
            Match.status == "confirmed",
            (Match.home_team_id == team.id) | (Match.away_team_id == team.id),
        ).all()

        for match in confirmed:
            is_home = match.home_team_id == team.id
            my_games = match.home_games_won if is_home else match.away_games_won
            opp_games = match.away_games_won if is_home else match.home_games_won

            stats.games_played = (stats.games_played or 0) + my_games + opp_games
            stats.wins = (stats.wins or 0) + my_games
            stats.losses = (stats.losses or 0) + opp_games
            stats.game_differential = (stats.game_differential or 0) + my_games - opp_games

            if match.winner_team_id == team.id:
                stats.match_wins = (stats.match_wins or 0) + 1
                stats.match_differential = (stats.match_differential or 0) + 1
            elif match.winner_team_id is None:
                stats.match_draws = (stats.match_draws or 0) + 1
            else:
                stats.match_losses = (stats.match_losses or 0) + 1
                stats.match_differential = (stats.match_differential or 0) - 1

        total_matches = (stats.match_wins or 0) + (stats.match_losses or 0) + (stats.match_draws or 0)
        stats.win_percentage = (stats.match_wins or 0) / total_matches if total_matches > 0 else 0.0

    db.commit()


def sort_standings(teams_stats: List[TeamSeasonStats], h2h_map: dict = None) -> List[TeamSeasonStats]:
    """
    Sort standings with tiebreakers:
    1. Win percentage
    2. Most wins
    3. Game differential
    4. H2H record
    5. Alphabetical (by team name)
    """
    def sort_key(s):
        h2h_wins = 0
        if h2h_map and s.team_id in h2h_map:
            h2h_wins = h2h_map[s.team_id]
        return (
            -(s.win_percentage or 0),
            -(s.match_wins or 0),
            -(s.game_differential or 0),
            -h2h_wins,
            s.team.name if s.team else "",
        )

    return sorted(teams_stats, key=sort_key)


def win_percentage(wins: int, losses: int, draws: int) -> float:
    total = wins + losses + draws
    return wins / total if total > 0 else 0.0


def game_differential(home_games: int, away_games: int, is_home: bool) -> int:
    if is_home:
        return home_games - away_games
    return away_games - home_games

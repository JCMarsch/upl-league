"""Round robin schedule generator."""
from typing import List, Tuple


def generate_round_robin(team_ids: List[int]) -> List[List[Tuple[int, int]]]:
    """
    Generate a round-robin schedule using the circle method.
    Returns a list of rounds, each round is a list of (home_id, away_id) pairs.
    Works for 4, 6, 8, 10 teams. Adds a dummy if count is odd.
    """
    n = len(team_ids)
    teams = list(team_ids)

    if n % 2 == 1:
        teams.append(None)  # dummy bye
        n += 1

    rounds = []
    fixed = teams[0]
    rotating = teams[1:]

    for round_num in range(n - 1):
        round_fixtures = []
        pairs = [fixed] + rotating
        for i in range(n // 2):
            home = pairs[i]
            away = pairs[n - 1 - i]
            if home is not None and away is not None:
                round_fixtures.append((home, away))
        rounds.append(round_fixtures)
        rotating = [rotating[-1]] + rotating[:-1]

    return rounds

# UPL Site - Automated Test Suite
## Overview
This document defines the automated tests Claude Code should write and maintain. Tests use **pytest** for the backend (FastAPI) and **Vitest + React Testing Library** for the frontend.

Claude Code should run the full test suite after every feature addition and fix any failures before considering a phase complete. Tests should be written alongside the feature, not after.

---

## Running Tests

```bash
# Backend tests
cd backend
pytest --cov=app --cov-report=term-missing

# Frontend tests
cd frontend
npm run test

# Run both from project root
make test
```

Add a `make test` target to the Makefile that runs both suites and fails if either fails.

---

## PROMPT TO ADD TO EACH BUILD PHASE

Add this instruction to the end of every Claude Code build prompt:

```
After building this feature, write automated tests for everything you just built. 

Backend tests go in backend/tests/ mirroring the app structure (e.g. app/routers/draft.py → tests/routers/test_draft.py).
Frontend tests go in frontend/src/__tests__/ mirroring the component structure.

Run the full test suite with `pytest` and `npm run test` before marking this phase done. Fix any failures. Do not move to the next phase with failing tests.
```

---

## SECTION 1 – Test Infrastructure (write in Prompt 0)

### Backend setup
```
Create the test infrastructure in backend/tests/:

- conftest.py with:
  - Test database (SQLite in-memory or separate Postgres test DB)
  - pytest fixtures: test_client (FastAPI TestClient), db_session, 
    auth_headers (returns JWT headers for a test user),
    admin_headers (returns JWT headers for admin user),
    manager_headers(team_id) for specific managers
  - Fixtures for common objects: test_season, test_teams(n=6), test_pokemon_species
  - Auto-rollback after each test (no state leakage between tests)

- pytest.ini or pyproject.toml with pytest config:
  - testpaths = tests
  - asyncio_mode = auto (for async FastAPI tests)

Install: pytest, pytest-asyncio, pytest-cov, httpx (for async test client)
```

### Frontend setup
```
Create frontend test infrastructure:

- vitest.config.ts - configure jsdom environment
- src/test/setup.ts - import @testing-library/jest-dom matchers
- src/test/utils.tsx - custom render wrapper that includes:
  - React Router (MemoryRouter)
  - Auth context with mock user
  - Mock API responses via msw (Mock Service Worker)
- src/test/handlers.ts - MSW handlers that mock all API endpoints

Install: vitest, @testing-library/react, @testing-library/user-event, msw, @testing-library/jest-dom
```

---

## SECTION 2 – Auth Tests (Prompt 2)

### Backend: tests/routers/test_auth.py
```python
# Write tests for:

def test_login_valid_credentials_returns_token()
def test_login_invalid_password_returns_401()
def test_login_unknown_user_returns_401()
def test_get_me_with_valid_token_returns_user()
def test_get_me_with_no_token_returns_401()
def test_get_me_with_expired_token_returns_401()
def test_manager_cannot_access_admin_endpoint()
def test_admin_can_access_admin_endpoint()
def test_create_user_as_admin_succeeds()
def test_create_user_as_manager_returns_403()
```

### Frontend: src/__tests__/auth/Login.test.tsx
```typescript
// Write tests for:

test("renders login form")
test("shows error on invalid credentials")
test("redirects to home on successful login")
test("disables submit button while loading")
test("protected route redirects to login when not authenticated")
test("protected route renders when authenticated")
test("admin route shows 403 for manager role")
```

---

## SECTION 3 – Season & Team Tests (Prompt 3)

### Backend: tests/routers/test_seasons.py
```python
def test_create_season_as_admin_succeeds()
def test_create_season_as_manager_returns_403()
def test_create_season_missing_required_fields_returns_422()
def test_get_season_returns_correct_data()
def test_update_season_config_in_setup_status_succeeds()
def test_update_season_config_after_draft_starts_returns_403()
def test_create_team_assigns_correct_manager()
def test_cannot_assign_same_manager_to_two_teams_in_same_season()
def test_list_teams_returns_all_teams_for_season()
```

---

## SECTION 4 – Tier & Draft Config Tests (Prompt 4)

### Backend: tests/routers/test_tiers.py
```python
def test_admin_can_set_tier_and_cost()
def test_bulk_update_saves_all_changes_not_just_last()
  # This test is important - set 10 pokemon tiers in one request, verify all 10 saved
def test_tier_update_blocked_after_lock()
def test_lock_tiers_changes_season_status()
def test_lock_tiers_with_missing_assignments_returns_400()
def test_illegal_pokemon_excluded_from_draft_pool()
def test_locked_tiers_still_readable()
```

---

## SECTION 5 – Draft Tests (Prompt 6) [CRITICAL]
These are the most important tests in the entire suite.

### Backend: tests/routers/test_draft.py
```python
# Basic flow
def test_draft_cannot_start_before_tiers_locked()
def test_admin_can_start_draft()
def test_manager_cannot_start_draft()
def test_pick_on_your_turn_succeeds()
def test_pick_on_someone_elses_turn_returns_403()
def test_pick_already_drafted_pokemon_returns_400()
def test_pick_illegal_pokemon_returns_400()
def test_pick_pokemon_over_budget_returns_400()
def test_pick_increments_pick_number()
def test_pick_decrements_team_points_remaining()
def test_pick_removes_pokemon_from_available_pool()

# Snake order
def test_round_1_order_is_1_through_n()
def test_round_2_order_is_n_through_1()
def test_round_3_order_is_1_through_n()
def test_turn_transitions_to_next_team_after_pick()
def test_turn_does_not_stay_on_same_team_after_pick()
  # This is the cascading bug test - after a pick, current_team_id must change

# Timer / autopick [CRITICAL - the LoL bug]
def test_autopick_fires_only_once_per_expired_turn()
  # Simulate timer expiry, verify exactly 1 pick is made, not 2 or 3
def test_autopick_does_not_fire_for_next_team_after_expiry()
  # After autopick for team A, team B's timer has not started firing
def test_timer_resets_for_next_team_after_pick()
def test_timer_stops_when_pick_is_made_manually()
def test_concurrent_autopick_requests_result_in_single_pick()
  # Simulate two autopick requests arriving simultaneously (race condition)
  # Use database-level locking, verify only 1 pick committed
def test_manual_pick_during_final_second_does_not_also_trigger_autopick()

# Points and slot validation
def test_cannot_draft_if_required_slots_would_become_unfillable()
def test_required_mega_slot_filled_correctly()
def test_draft_completes_when_all_slots_filled()
def test_auction_bid_deducts_correct_points()
def test_auction_cannot_bid_more_than_budget()
```

### Backend: tests/services/test_draft_service.py
```python
# Unit tests for the draft state machine
def test_get_next_team_snake_round_1()
def test_get_next_team_snake_round_2_reverses()
def test_get_next_team_at_round_boundary()
def test_autopick_selects_highest_tier_available_pokemon()
def test_generate_snake_order_correct_for_6_teams()
def test_generate_snake_order_correct_for_4_teams()
def test_generate_snake_order_correct_for_10_teams()
```

### Frontend: src/__tests__/draft/DraftRoom.test.tsx
```typescript
test("shows pick button only for current manager's turn")
test("pick button disabled when not your turn")
test("picked pokemon disappears from available list")
test("team roster updates after pick")
test("points remaining decreases after pick")
test("timer displays and counts down")
test("timer resets after pick is made")
test("draft board updates in correct position after pick")
test("reconnecting to draft shows current state not stale state")
```

---

## SECTION 6 – Match & Stats Tests (Prompt 8 & 9)

### Backend: tests/routers/test_matches.py
```python
def test_submit_result_creates_pending_match()
def test_confirm_result_changes_status_to_confirmed()
def test_cannot_confirm_own_submission()
  # The submitting player should not be able to confirm their own result
def test_admin_can_confirm_any_result()
def test_cannot_submit_already_confirmed_match()
def test_conflicting_submissions_create_dispute_state()
def test_stats_update_after_confirmation()
def test_stats_do_not_update_on_pending_result()
def test_admin_edit_result_recalculates_stats()
  # Critical: editing must invalidate old stats, not leave stale data
def test_draw_result_recorded_correctly()
```

### Backend: tests/services/test_stats_service.py
```python
def test_win_percentage_calculation()
def test_game_differential_calculation()
def test_match_differential_calculation()
def test_kill_death_differential_calculation()
def test_direct_kills_passive_kills_sum_to_total()

# Tiebreaker tests [CRITICAL]
def test_tiebreaker_win_percentage_first()
def test_tiebreaker_wins_when_win_pct_equal()
def test_tiebreaker_differential_when_wins_equal()
def test_tiebreaker_h2h_when_differential_equal()
def test_tiebreaker_alphabetical_as_final_fallback()
def test_tiebreaker_never_leaves_two_teams_equal_rank()
  # Run this with every possible equal scenario, verify unique rank always assigned

def test_mvp_ranking_most_kills_first()
def test_mvp_ranking_differential_breaks_kill_tie()
def test_pokemon_stats_aggregated_correctly_across_games()
```

---

## SECTION 7 – Transactions Tests (Prompt 10)

### Backend: tests/routers/test_waivers.py
```python
def test_waiver_claim_adds_pokemon_to_team()
def test_waiver_claim_removes_dropped_pokemon()
def test_waiver_claim_blocked_if_over_budget()
def test_waiver_claim_blocked_for_drafted_pokemon()
def test_waiver_order_starts_as_reverse_draft_order()
def test_waiver_order_updates_after_week_rollover()
def test_using_waiver_moves_team_to_bottom_of_order()
def test_not_using_waiver_keeps_relative_position()
def test_same_pokemon_claimed_by_two_teams_higher_priority_wins()
```

### Backend: tests/routers/test_trades.py
```python
def test_trade_proposal_creates_pending_trade()
def test_all_teams_can_vote_on_trade()
def test_majority_approve_passes_trade()
def test_majority_deny_fails_trade()
def test_passed_trade_swaps_pokemon_between_rosters()
def test_passed_trade_adjusts_points_budgets()
def test_cancelled_trade_does_not_move_pokemon()
def test_two_trades_involving_same_pokemon_blocks_second()
def test_trade_vote_is_one_per_team()
def test_admin_can_confirm_trade_without_vote()
```

---

## SECTION 8 – Replay Parser Tests (Prompt 11)

### Backend: tests/services/test_replay_parser.py
```python
# Use fixture replay logs stored in tests/fixtures/replays/

def test_parses_leads_correctly()
  # Use a known replay, verify correct 4 leads identified
def test_parses_all_brought_pokemon_correctly()
def test_direct_kill_counted_correctly()
def test_passive_kill_from_poison_counted_correctly()
def test_passive_kill_from_burn_counted_correctly()
def test_passive_kill_from_hazards_counted_correctly()
def test_recoil_death_counts_as_passive()
def test_struggle_death_counts_as_passive()
def test_kills_attributed_to_correct_team()
  # Verify team A's kills are not credited to team B
def test_invalid_url_returns_error_not_exception()
def test_private_replay_returns_error_not_exception()
def test_parse_failure_does_not_block_manual_entry()
```

Store 3-4 real Showdown replay JSON files in `tests/fixtures/replays/` as test fixtures so parser tests don't depend on network access.

---

## SECTION 9 – Multi-Season Isolation Tests (Prompt 12)

### Backend: tests/services/test_season_isolation.py
```python
def test_season_1_stats_not_in_season_2_standings()
def test_season_1_roster_not_in_season_2_roster()
def test_career_stats_aggregate_across_seasons()
def test_all_time_kills_sums_all_seasons()
def test_closing_season_1_does_not_affect_season_2()
def test_champion_recorded_per_season_not_global()
```

---

## SECTION 10 – Integration Tests

### Backend: tests/integration/test_full_season_flow.py
```python
def test_full_season_happy_path():
    """
    End-to-end test of a complete mini season:
    1. Admin creates season
    2. Admin sets tiers and locks
    3. Draft completes (6 teams, 3 rounds)
    4. Schedule generated
    5. All matches submitted and confirmed
    6. Standings calculated correctly
    7. Season closed, awards assigned
    8. History shows correct data
    """

def test_waiver_mid_season_flow():
    """
    1. Season in progress
    2. Manager claims waiver
    3. Waiver processed
    4. Roster updated
    5. Stats for new pokemon start from 0 (not inherited)
    """

def test_trade_mid_season_flow():
    """
    1. Trade proposed
    2. League votes
    3. Trade passes
    4. Rosters swap
    5. Stats correctly attributed after trade
    """
```

---

## CI/CD Note for GitHub

Once pushed to GitHub, add a GitHub Actions workflow at `.github/workflows/test.yml`:

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: cd backend && pip install -r requirements.txt
      - run: cd backend && pytest --cov=app

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd frontend && npm ci
      - run: cd frontend && npm run test
```

This means every push to GitHub automatically runs the full test suite. If tests fail, the push is flagged. When you eventually collaborate with others this prevents anyone merging broken code.

---

## Coverage Targets
- Backend: aim for >80% coverage overall, 100% on draft service and stats service
- Frontend: aim for >70% coverage on components, 100% on utility functions
- Run `pytest --cov=app --cov-report=html` to see exactly what is and isn't covered

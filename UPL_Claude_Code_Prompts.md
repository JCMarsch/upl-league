# UPL Site - Claude Code Build Prompts
## How to use this document
All four project documents should be in your project root folder:
- UPL_Site_Spec.md
- UPL_Claude_Code_Prompts.md
- UPL_Automated_Tests.md
- UPL_Test_Plan.md

To start, open Claude Code in your project folder and say:

> "Read UPL_Claude_Code_Prompts.md, UPL_Site_Spec.md, and UPL_Automated_Tests.md. Then execute all prompts in order from Prompt 0 through Prompt 15. After each prompt, run the full test suite, fix any failures, then automatically move on to the next prompt without waiting for me."

That's it. Claude Code will read the files, build the entire site phase by phase, run tests after each phase, and keep going on its own.

If it gets confused or goes off track at any point, say:

> "Re-read UPL_Site_Spec.md and continue from Prompt [N]."

---

## PROMPT 0 – Project Bootstrap

```
I am building a Pokemon draft league website called UPL. I have a full specification document at UPL_Site_Spec.md in this directory. Please read it fully before doing anything.

Once you have read it, scaffold the full project structure with:
- FastAPI backend (Python) in a /backend folder
- React + Vite frontend in a /frontend folder
- Docker Compose file for local development (FastAPI + React + Postgres)
- A .env.example file with all required environment variables
- Alembic set up for database migrations
- README.md with setup instructions

Do NOT build any features yet. Just the scaffold, folder structure, config, and a health check endpoint on the API. Make sure the frontend can reach the backend.

Also set up the test infrastructure from UPL_Automated_Tests.md Section 1 - pytest with conftest.py fixtures for the backend, and Vitest + MSW for the frontend. Write a test that verifies the health check endpoint returns 200. Run both test suites and confirm they pass before finishing this phase.
```

---

## PROMPT 1 – Database Models & Seed

```
Read UPL_Site_Spec.md section 4 (Database Schema).

Create all SQLAlchemy models for every table in the spec. Then:
1. Generate the initial Alembic migration from these models
2. Write a seed script (scripts/seed_pokemon.py) that fetches Pokemon data from PokeAPI and populates the pokemon_species table. It should:
   - Fetch all Pokemon in the Scarlet/Violet + DLC dex (the current VGC legal pool, approx Gen 9 + carried forward)
   - Handle formes separately (Mega, Regional, Paradox etc.)
   - Store sprite URLs from PokeAPI
   - Be idempotent (safe to re-run without duplicates)
   - Flag Mega formes with is_mega=True and link to their base forme via base_forme_id
3. Write a second seed script (scripts/seed_test_data.py) that creates a test season, 6 test teams, and assigns test users so the UI can be developed against real data.

The seed scripts should run via `python scripts/seed_pokemon.py` from the backend directory.

After building, write tests verifying: all models can be created and queried, the seed script is idempotent (run it twice, no duplicate rows), Mega formes are correctly linked to base formes. Run pytest and fix any failures before finishing this phase.
```

---

## PROMPT 2 – Auth System

```
Read UPL_Site_Spec.md section 3 (User Roles).

Build the full authentication system:

Backend:
- POST /auth/register (admin only can create accounts)
- POST /auth/login (returns JWT)
- POST /auth/logout
- GET /auth/me (returns current user + roles)
- Role-based dependency injection (get_current_user, require_admin, require_manager)
- Passwords hashed with bcrypt
- JWT stored in httpOnly cookie

Frontend:
- Login page (username + password)
- Auth context/store (React Context or Zustand)
- Protected route wrapper component
- Redirect to login if not authenticated
- Role-aware navigation (admin links only show for admins)

Keep the UI clean and functional for now, styling comes later.

After building, write and run all tests from UPL_Automated_Tests.md Section 2. Every auth test must pass before finishing this phase.
```

---

## PROMPT 3 – Season & Team Setup (Admin)

```
Read UPL_Site_Spec.md sections 5.3 and 7.

Build the admin season setup flow:

Backend endpoints:
- POST /seasons (create season with all config fields from spec)
- GET /seasons (list all seasons)
- GET /seasons/{id} (season detail)
- PATCH /seasons/{id} (update season config, only allowed in setup status)
- POST /seasons/{id}/teams (create team for a season, assign manager)
- GET /seasons/{id}/teams (list teams)

Frontend:
- Admin dashboard page
- Create season form (all config fields: format, points budget, required slots, draft type, timer, series format, keeper enabled)
- Team management page (create teams, assign managers, upload team logo, set team colours)

After this prompt the admin should be able to fully configure a season before the draft begins.

After building, write and run all tests from UPL_Automated_Tests.md Section 3. Run the full pytest suite (not just new tests) to check nothing from previous phases is broken.
```

---

## PROMPT 4 – Tier & Legality Management

```
Read UPL_Site_Spec.md sections 5.3 and 7 (tier locking rules).

Build tier and legality management:

Backend:
- GET /seasons/{id}/pokemon (list all pokemon with their tier/legality for this season)
- POST /seasons/{id}/pokemon/bulk-update (admin sets tier + point_cost + is_legal for multiple pokemon at once)
- POST /seasons/{id}/lock-tiers (locks all tier/cost data, changes season status to draft-ready)
- Tiers should only be editable when season status is 'setup'

Frontend (admin):
- Pokemon management page with a large filterable/searchable table
- Inline editing of tier and point cost per Pokemon
- Visual tier grouping
- Legality toggle per Pokemon  
- Lock tiers button with confirmation dialog
- Show which Pokemon have missing tier assignments before allowing lock

This is a key admin workflow - make it efficient since they may be setting tiers for 100+ Pokemon.

After building, write and run all tests from UPL_Automated_Tests.md Section 4. Pay special attention to test_bulk_update_saves_all_changes_not_just_last - this is a common bug. Run the full pytest suite before finishing.
```

---

## PROMPT 5 – Public Tier List & Pokemon Database

```
Read UPL_Site_Spec.md section 5.1.

Build two public-facing pages:

1. Tier List page (/tier-list):
- Visual tier list grouped by tier (S, A, B, C, D etc.)
- Each tier shows Pokemon sprites in a grid with name and point cost
- Colour-coded by tier
- Shows draft status (Available / [Team Name])
- Toggle between current season tiers

2. Pokemon Database page (/pokemon):
- Full searchable, filterable table of all legal Pokemon this season
- Filters: type, tier, availability (drafted/available), name search
- Columns: sprite, name, type(s), tier, cost, HP, Atk, Def, SpAtk, SpDef, Spe, Total, owner (if drafted), league stats (kills, deaths, +/-)
- Click through to individual Pokemon page showing full detail + league history

Make these pages visually polished. Use official Pokemon sprites. These are the most visited pages in the league.

After building, write frontend tests verifying: tier list renders all tiers, Pokemon can be searched and filtered, unavailable Pokemon show their owner's name. Run npm run test and pytest before finishing.
```

---

## PROMPT 6 – Live Draft Room

```
Read UPL_Site_Spec.md sections 5.4 and 7.

Build the live draft system. This is the most complex feature.

Backend:
- WebSocket endpoint /ws/draft/{season_id}
- Draft state management (current pick, order, timer)
- POST /draft/{season_id}/start (admin only)
- POST /draft/{season_id}/pick (make a pick - validates it's your turn, pokemon is available and legal, you have points)
- POST /draft/{season_id}/pause and /resume (admin)
- Draft order generation for snake draft (reverses each round)
- Auction draft: broadcast nominations, handle bids, close on timer
- Timer: count down per pick, auto-pass on expiry if configured
- All picks broadcast to all connected clients in real time

Frontend:
- Draft room page (/draft)
- Left panel: available Pokemon list with search/filter and tier grouping
- Centre: draft board showing all picks by round and position
- Right panel: all teams with their current rosters + points remaining
- Top bar: current pick indicator, who is on the clock, timer countdown
- Only show pick button when it is your turn
- Admin controls: pause/resume, skip current manager
- Graceful reconnect on disconnect

Points validation: check required slots are fillable with remaining picks and budget.

After building, write and run ALL tests from UPL_Automated_Tests.md Section 5. This is the most critical section - do not skip any tests. The cascading autopick tests and the concurrent pick race condition test are mandatory. Run the full test suite. Fix every failure before finishing this phase.
```

---

## PROMPT 7 – Team Pages

```
Read UPL_Site_Spec.md sections 5.1 and 5.2 (team page features).

Build team pages:

Backend:
- GET /teams/{id} (full team data including roster, stats, schedule, trophy cabinet)
- PATCH /teams/{id}/pokemon/{roster_id} (update moves/ability/item/tera - manager/admin only)
- Team page data should include: roster, type coverage calc, avg base stats, upcoming matches, past results, awards, season history

Frontend - Public team page (/teams/{id}):
- Team header: logo, name, colours, manager name, record
- Roster grid: sprites + names, clicking expands to show moves/ability/item/tera (public can see sets)
- Type weakness chart: show weaknesses across the full 6-Pokemon roster
- Average base stats radar chart (HP/Atk/Def/SpAtk/SpDef/Spe)
- Trophy cabinet: league wins + awards with icons
- Upcoming schedule with opponent info
- Season history table

Frontend - Private additions (manager/admin only):
- Edit mode on roster (inline edit moves/ability/item/tera type)
- Private team builder section (simple 6-slot builder with type chart, not visible publicly)

Make the team page visually the best page on the site. This is the page managers will share with each other.

After building, write tests verifying: public view shows roster correctly, private team builder is not accessible by other managers, type weakness chart calculates correctly for a known team, edit mode saves and persists. Run the full test suite before finishing.
```

---

## PROMPT 8 – Schedule & Matches

```
Read UPL_Site_Spec.md section 5.3 (schedule generator) and the match/game schema from section 4.

Build the schedule and match system:

Backend:
- POST /seasons/{id}/schedule/generate (admin - generates round robin schedule)
- GET /seasons/{id}/schedule (full schedule)
- GET /matches/{id} (match detail with all games and stats)
- POST /matches/{id}/submit (submit result + replay URLs)
- POST /matches/{id}/confirm (confirm opponent's submitted result)
- POST /matches/{id}/games/{game_id}/stats (manual stat entry per game)
- Admin override endpoints for result correction

Frontend:
- Schedule page (/schedule) - full season schedule, grouped by week, shows results
- Match page (/matches/{id}) - match detail, game by game breakdown, replay links, stats table
- Submit result modal/page (for managers) - enter game scores, replay URLs per game, basic stat entry
- Confirm result flow
- Admin result management page

Schedule generator should handle variable player counts (4-10 teams) and produce a balanced round robin.

After building, write and run all tests from UPL_Automated_Tests.md Section 6 (matches). Also test the schedule generator produces correct matchups for 4, 6, 8, and 10 team counts with no team playing itself. Run the full test suite before finishing.
```

---

## PROMPT 9 – Standings & Stats

```
Read UPL_Site_Spec.md sections 5.6 and the stats schema from section 4.

Build the standings and stats system:

Backend:
- GET /seasons/{id}/standings (full standings with all tiebreaker fields)
- GET /seasons/{id}/pokemon-stats (MVP list sorted by ranking rules from spec)
- GET /seasons/{id}/team-stats/{team_id} (full team stat breakdown)
- Stats should be cached/materialised, recalculated when a result is confirmed
- Tiebreaker logic must match spec exactly: Win% > Wins > +/- > H2H > custom > Alphabet

Frontend:
- Standings page (/standings) - full table with all columns: W/L/D, game diff, match diff, total kills, total deaths, KD diff, win streak, points (for playoff seeding). Sortable columns.
- Pokemon / MVP page (/pokemon-stats) - ranked list of all Pokemon with full stats, who owns them, bring rate, lead rate, kill/death breakdown
- Home page summary widget showing current top 4

Make standings data auto-refresh every 60 seconds or on result confirmation.

After building, write and run all tests from UPL_Automated_Tests.md Section 7. The tiebreaker tests are mandatory - run every tiebreaker scenario. Run the full test suite before finishing.
```

---

## PROMPT 10 – Transactions (Waivers & Trades)

```
Read UPL_Site_Spec.md section 5 (waivers and trades) and section 4 (transaction schema).

Build the transaction system:

WAIVERS:
Backend:
- POST /seasons/{id}/waivers (submit waiver claim)
- GET /seasons/{id}/waivers (list pending + recent waivers)
- POST /seasons/{id}/waivers/{id}/process (admin - approve/deny)
- GET /seasons/{id}/waiver-order (current priority order)
- Auto-update waiver order each week (worst record moves up)

TRADES:
Backend:
- POST /seasons/{id}/trades (propose trade)
- GET /seasons/{id}/trades (list all trades)
- POST /trades/{id}/vote (cast vote - one per team)
- POST /trades/{id}/confirm (admin confirm after vote passes)
- POST /trades/{id}/cancel (proposing team can cancel pending trade)

Frontend:
- Transactions page (/transactions) - public log of all completed transactions
- Waiver claim page (manager) - select add + optional drop, see your position in waiver order
- Pending waivers list (admin) - process claims in priority order
- Trade centre page - propose trade (select pokemon to give/receive, select trade partner), view pending trades, cast votes
- Trade vote modal - shows both sides of the trade, vote approve/deny

Business rules: validate point budget on waiver claims and trades. Trades need majority of teams to vote approve.

After building, write and run all tests from UPL_Automated_Tests.md Section 8. The waiver order tests and the simultaneous trade conflict test are mandatory. Run the full test suite before finishing.
```

---

## PROMPT 11 – Replay Parser

```
Read UPL_Site_Spec.md section 5.5 (replay parsing).

Build the Showdown replay parser:

Backend:
- Service: replay_parser.py
- Given a Showdown replay URL, fetch https://replay.pokemonshowdown.com/{id}.json
- Parse the log field turn by turn to extract:
  - Which 4 Pokemon each side led with (first 2 per team = leads, all 4 brought)
  - All KOs: determine if direct (from a move that turn) or passive (from status/hazard/weather at end of turn)
  - Map KOs to the correct team's roster pokemon
  - Handle edge cases: switches, faints from recoil, hazard damage
- Return structured game_stats data
- On parse failure: return partial data with error flag, do not block result submission

Integration:
- Hook into game submission: when a replay URL is provided, attempt auto-parse
- Show parsed stats in the submit form for manager to review/correct before confirming
- Store raw replay log in DB for reprocessing if parser improves

Frontend:
- In the submit result flow, after entering a replay URL show a "Parse Replay" button
- Display parsed stats in an editable table (manager can correct before submitting)
- Clear indication of which stats were auto-parsed vs manually entered

After building, write and run all tests from UPL_Automated_Tests.md Section 9. Download 3-4 real Showdown replays and save them as test fixtures in tests/fixtures/replays/ so parser tests never depend on network access. Run the full test suite before finishing.
```

---

## PROMPT 12 – League History & Awards

```
Read UPL_Site_Spec.md section 5 (history and awards) and the season_results/awards schema.

Build the history and awards system:

Backend:
- POST /seasons/{id}/close (admin - finalise season, record final standings, trigger auto awards)
- GET /history (all seasons summary)
- GET /history/{season_id} (full archived season data)
- GET /managers/{user_id}/career (all-time stats for a manager across all seasons)
- Auto-calculated awards at season close: Champion, Best Record, Most Kills, Most Efficient (best KD), Most Deadly (most direct kills)
- POST /seasons/{id}/awards (admin create custom award + assign recipient)

Frontend:
- League history page (/history) - season by season archive, champion each year, notable stats
- Career page per manager (/managers/{id}) - all seasons played, cumulative stats, awards won
- Awards page (/awards) - current season awards + past season awards
- Trophy cabinet on team pages auto-populated from awards table

All-time records leaderboard: Most season wins, Most career kills, Best single-season KD, Longest win streak etc.

After building, write and run all tests from UPL_Automated_Tests.md Section 10. Also run the full integration test from Section 10 (test_full_season_happy_path) end to end. Run the full test suite before finishing.
```

---

## PROMPT 13 – Notifications

```
Read UPL_Site_Spec.md section 4.5 (notifications schema).

Build the full notification system:

Backend:
- Notification service that fires on key events:
  - Draft: your pick is coming up (2 picks ahead), it's your turn
  - Trade: trade proposed to you, trade vote needed, trade approved/denied
  - Waiver: your claim was approved/denied, new waiver order posted
  - Match: opponent submitted result (needs your confirmation), result confirmed
  - Season: draft starting soon, season starting, playoffs starting
- In-app: POST/GET /notifications (mark read, list unread)
- Email: SMTP config in .env, send HTML email for each event type
- Discord: POST to webhook URL on events, configurable per event type in admin

Frontend:
- Notification bell in nav bar with unread count badge
- Notification dropdown / page - list of all notifications, mark read
- Admin page for configuring Discord webhook URL and which events fire it
- User settings page: opt in/out of email notifications per event type

After building, write and run all tests from UPL_Automated_Tests.md Section 11. For Discord webhook tests, use a mock URL and verify the correct payload is sent without actually hitting Discord. Run the full test suite before finishing.
```

---

## PROMPT 14 – Theming & Polish

```
Read UPL_Site_Spec.md section 5.8 (theming).

Final polish pass:

THEMING:
- Implement CSS variable based theming throughout
- Three modes: Light, Dark, Pokemon (colourful, game-inspired)
- Team pages use team primary/secondary colours for accents
- Admin can set league primary colour (derived from league logo)
- Theme toggle in nav bar, preference saved to localStorage

DESIGN POLISH:
- Consistent component library (buttons, cards, tables, badges, modals)
- Pokemon type colour badges (Fire = orange, Water = blue, etc.) used throughout
- Sprite hover effects on tier list and team pages
- Loading skeletons on all data-fetching pages
- Empty states for all lists (no schedule yet, no results yet, etc.)
- Error boundaries and friendly error pages

MOBILE:
- Full audit of all pages on mobile viewport
- Sticky nav with hamburger menu on mobile
- Draft room mobile layout (collapsible panels)
- Touch-friendly controls on all interactive elements

PERFORMANCE:
- Standings and stats pages use cached data with stale-while-revalidate
- Images lazy-loaded
- API response pagination on long lists
- Database indexes on frequently queried columns (season_id, team_id, species_id)

After building, run the full pytest and npm run test suites. This is a polish phase so there are no new feature tests, but confirm zero regressions from the theming and performance changes before finishing.
```

---

## PROMPT 15 – Deployment

```
Read UPL_Site_Spec.md and review the full project.

Prepare the project for Railway deployment:

1. railway.toml or Procfile configured for FastAPI backend
2. Frontend build step outputs to /frontend/dist, served by backend or separate static service
3. Environment variables documented in .env.example:
   - DATABASE_URL (Railway Postgres)
   - SECRET_KEY (JWT)
   - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
   - DISCORD_WEBHOOK_URL
   - ALLOWED_ORIGINS (CORS)
4. Database migration runs automatically on deploy (alembic upgrade head in startup)
5. Static files (sprites etc.) - either served from backend or configure Railway volume
6. Health check endpoint for Railway
7. Logging configured for production (structured JSON logs)
8. Final README with:
   - Local dev setup
   - Railway deployment steps
   - First-time setup guide (create superadmin, seed Pokemon, create first season)

Run a final check: does the app work end-to-end from account creation through to a completed match result?

Run the complete test suite one final time - pytest and npm run test. Also run the GitHub Actions workflow locally if possible (act tool) to confirm CI passes. Target: zero failing tests before first deploy.
```

---

## Notes on using these prompts

- If Claude Code gets confused or starts going off-spec, paste the relevant section from UPL_Site_Spec.md into the prompt
- After each phase, manually test the key flows before moving on
- If a phase is too large, split it - e.g. Phase 6 (draft) can be split into backend-only first, then frontend
- Keep UPL_Site_Spec.md in the project root so Claude Code can always reference it
- When adding new features later (e.g. Pokemon Champions parser, keeper draft), write a new prompt in this style referencing the spec and any new rules

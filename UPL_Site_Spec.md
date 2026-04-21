# UPL - Pokemon Draft League Site
## Full Project Specification

---

## 1. Project Overview

A full-stack web application for running a Pokemon VGC/Singles draft league. The site handles everything from pre-season setup and live drafting through to match reporting, stat tracking, and historical records across multiple seasons.

**League name:** UPL (configurable)  
**Target users:** 4–10 managers per season + admins  
**Hosting:** Railway (Postgres + web service)  
**Primary platforms:** Desktop and mobile (fully responsive)

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | Python (FastAPI) |
| Database | PostgreSQL (Railway) |
| Auth | JWT, username/password |
| Real-time (draft) | WebSockets |
| Notifications | In-app + Email (SMTP) + Discord webhooks |
| Pokemon data | PokeAPI + local seed |
| Replay parsing | Showdown replay JSON API |
| Styling | Tailwind CSS |
| Hosting | Railway |

---

## 3. User Roles & Permissions

| Role | Description |
|---|---|
| `superadmin` | Full access, can manage all seasons, users, and config |
| `admin` | Season-level admin, can confirm results, manage trades, assign awards |
| `manager` | Can edit own team, submit results, propose trades, claim waivers |
| `viewer` | Read-only access (optional public access) |

- A user account can hold multiple roles
- Admin assigns roles per user
- Tiers and point costs lock once draft starts

---

## 4. Database Schema

### 4.1 Core Tables

```
users
- id, username, password_hash, email, discord_id, role[], created_at

seasons
- id, name, format (VGC/Singles), year, status (setup/draft/regular/playoffs/complete)
- draft_type (snake/auction), draft_timer_seconds (null = no timer)
- points_budget, roster_size, free_pick_slots
- required_slots (JSON: {mega: 1, S: 1, A: 1, ...})
- series_format (bo3/bo5/bo1), match_format (round_robin/etc)
- playoff_format (JSON config), keeper_enabled, language, created_at

teams
- id, season_id, manager_id (FK users), name, abbreviation
- logo_url, primary_color, secondary_color
- points_remaining, created_at

pokemon_species
- id, pokedex_number, name, forme_name, is_base_forme
- base_forme_id (FK self, null if base), is_mega, is_regional_variant
- type1, type2, hp, atk, def, spatk, spdef, spe, total
- sprite_url, artwork_url, generation
- can_coexist_with (JSON array of species_ids that share a base but are legal together)

season_pokemon
- id, season_id, species_id, tier, point_cost, is_legal
- drafted_by_team_id (null if undrafted), draft_pick_number, acquired_via (draft/waiver/trade/FA)
- locked_at (timestamp when tiers locked)

roster_pokemon
- id, team_id, season_pokemon_id
- nickname, ability, item, move1, move2, move3, move4
- tera_type (VGC), notes, is_active

draft
- id, season_id, status (pending/active/paused/complete)
- current_pick_number, current_team_id, pick_started_at, timer_seconds

draft_picks
- id, draft_id, pick_number, round_number, team_id, season_pokemon_id
- picked_at, time_taken_seconds

draft_order
- id, draft_id, round_number, pick_position, team_id
```

### 4.2 Schedule & Matches

```
schedule
- id, season_id, week_number, home_team_id, away_team_id
- scheduled_date, status (scheduled/completed/postponed)

matches
- id, schedule_id, season_id, week_number
- home_team_id, away_team_id
- home_games_won, away_games_won
- winner_team_id, status (pending/submitted/confirmed/disputed)
- submitted_by_id, confirmed_by_id, confirmed_at
- notes

games (individual games within a match/series)
- id, match_id, game_number
- winner_team_id, loser_team_id
- replay_url, replay_source (showdown/champions)
- replay_parsed (bool)
- submitted_at

game_stats (per pokemon per game)
- id, game_id, team_id, species_id
- was_brought (bool), was_lead (bool)
- direct_kills, passive_kills, direct_deaths, passive_deaths
- notes
```

### 4.3 Transactions

```
waivers
- id, season_id, week_number, team_id
- add_species_id, drop_species_id (nullable)
- priority_at_time, status (pending/approved/denied/processed)
- submitted_at, processed_at, processed_by_id
- notes

waiver_order
- id, season_id, week_number, team_id, priority_position

trades
- id, season_id, proposed_by_team_id, proposed_to_team_id
- status (pending/voting/approved/denied/cancelled)
- proposed_at, resolved_at, effective_week
- notes

trade_assets
- id, trade_id, from_team_id, to_team_id, season_pokemon_id

trade_votes
- id, trade_id, team_id, vote (approve/deny), voted_at
```

### 4.4 Stats & History

```
team_season_stats (materialised/cached)
- id, team_id, season_id
- games_played, wins, losses, draws
- game_differential (pokemon advantage)
- match_wins, match_losses, match_draws
- match_differential (game advantage)
- direct_kills, passive_kills, total_kills
- direct_deaths, passive_deaths, total_deaths
- kill_death_differential, win_percentage, streak

h2h_records
- id, season_id, team_a_id, team_b_id
- team_a_match_wins, team_b_match_wins, draws

pokemon_season_stats (materialised/cached)
- id, species_id, season_id, team_id
- games_played, games_won, games_brought, games_led
- direct_kills, passive_kills, total_kills
- direct_deaths, passive_deaths, total_deaths
- kill_death_differential, pick_number, acquired_via

awards
- id, season_id, name, description, icon_url
- is_auto_calculated (bool), auto_calc_metric
- recipient_team_id, recipient_notes
- awarded_at

season_results
- id, season_id, team_id, final_rank
- champion (bool), runner_up (bool), playoff_result
```

### 4.5 Config & Notifications

```
league_config
- id, key, value, season_id (null = global), updated_by_id, updated_at

notifications
- id, user_id, type, title, body, read (bool), created_at, link

discord_webhooks
- id, season_id, url, events[] (draft_pick/trade/waiver/result/etc), active
```

---

## 5. Features

### 5.1 Public Pages (no login required)

- **Home / Dashboard** – current season standings summary, recent results, upcoming schedule
- **Standings** – full table with W/L/D, game diff, match diff, kills/deaths, streak, H2H
- **Tier List** – visual tier list (S/A/B/C/D with sprites) + searchable/filterable Pokemon database
- **Pokemon Database** – searchable, filterable by type/tier/team/availability; shows all stats + league stats
- **Team Pages** – roster, sprites, type coverage chart, average base stats, trophy cabinet, season history
- **Schedule** – full season schedule with results
- **Match Pages** – individual match detail, game replays, per-game stats
- **League History** – all-time records, season archives, career stats per manager
- **Awards** – current season awards + historical

### 5.2 Manager Pages (login required)

- **My Team** – full editable team page (moves/abilities/items/tera type per Pokemon)
- **Team Builder** – private mini teambuilder, only visible to the coach (not public)
- **Submit Result** – submit match result + replay URL(s), confirm opponent's submission
- **Waiver Claims** – submit waiver add/drop, view current waiver order
- **Trade Centre** – propose trade, view pending trades, cast vote on league trades
- **Draft Room** – live draft interface (when draft is active)
- **Notifications** – in-app notification centre

### 5.3 Admin Pages (admin role required)

- **Season Setup** – create season, configure rules, points, required slots, playoff format
- **Tier Management** – set/edit tier and point cost per Pokemon (locks at draft start)
- **Legality List** – mark which Pokemon are legal this season
- **Draft Management** – set draft order, start/pause/resume draft, override picks
- **Schedule Generator** – auto-generate round robin schedule, manual override
- **Result Management** – confirm/override match results, resolve disputes
- **Waiver Processing** – review and process waiver claims each week
- **Trade Approval** – monitor trade votes, intervene if needed
- **Award Assignment** – assign custom awards, trigger auto-calculated awards at season end
- **User Management** – create accounts, assign roles

### 5.4 Draft Room

- Live snake or auction draft via WebSockets
- Shows: draft board (all picks so far), current pick, on the clock indicator, timer (if enabled)
- Pokemon available list with search/filter and tier display
- Each manager can only pick when it's their turn
- Auto-skip on timer expiry (configurable)
- Draft board visible to all logged-in users in real time
- Chat/commentary sidebar (nice to have)
- Admins can pause draft, override picks

### 5.5 Replay Parsing

- Showdown replays: fetch `https://replay.pokemonshowdown.com/[id].json`
- Parse turn log for: leads (first 2 Pokemon sent out each side), KOs (direct vs passive), faints
- Auto-populate game_stats on successful parse
- Manual override always available
- Pokemon Champions: manual entry only for now, parser added later

### 5.6 Stats & Standings Tiebreakers

Standings order (configurable per season, defaults from VGC sheet):
1. Win percentage
2. Most wins
3. Game differential (+/-)
4. H2H record
5. Tiebreaker scheme (configurable - e.g. total kills, then direct kills, etc.)
6. Alphabetical

MVP / Pokemon rankings order:
1. Most total kills
2. Higher +/-
3. Fewer games played
4. Most games won
5. Most direct kills
6. Fewest direct deaths

### 5.7 Team Page Features

- Roster with sprites (official artwork + showdown sprites)
- Moves, ability, item, tera type per Pokemon (public view shows Pokemon, private view shows full sets)
- Type weakness chart across full roster
- Average base stats radar chart (HP/Atk/Def/SpAtk/SpDef/Spe)
- Trophy cabinet (league wins + awards)
- Season history (past seasons, final rank, record)
- Upcoming schedule + basic opponent info
- Private team builder (visible to owner/admin only)

### 5.8 Theming

- Light / Dark / Pokemon theme modes
- League logo displayed in header
- Team colours used on team pages and standings
- Theme colours can be derived from league logo (admin sets hex codes)
- CSS variables throughout, no hardcoded colours

---

## 6. Build Phases

### Phase 1 – Foundation
- Project scaffold (FastAPI + React + Postgres)
- Auth system (JWT, login/logout, roles)
- Season and team creation (admin)
- Pokemon species seeding from PokeAPI
- Basic legality and tier management

### Phase 2 – Draft System
- Tier list page (public)
- Pokemon database page (public)
- Draft configuration
- Live draft room (WebSockets, snake + auction)
- Roster pages post-draft

### Phase 3 – Season Management
- Schedule generation
- Team pages (public + private views)
- Match submission and confirmation workflow
- Manual game stat entry

### Phase 4 – Stats & Standings
- Standings page with full tiebreaker logic
- Pokemon stats / MVP list
- Team stat summaries (kills, deaths, differentials)
- Average base stats per team

### Phase 5 – Transactions
- Waiver system (order tracking, weekly processing)
- Trade system (proposals, league voting, admin confirm)
- Transaction log (public)

### Phase 6 – Replay Parsing & Advanced Stats
- Showdown replay parser
- Auto-populated game stats
- ExpandedStats view (bring rates, lead rates, per-Pokemon deep stats)

### Phase 7 – History & Awards
- Multi-season history
- Career stats per manager
- All-time records and leaderboards
- Awards system (auto + manual)
- Trophy cabinets on team pages

### Phase 8 – Notifications & Polish
- In-app notifications
- Email notifications (SMTP)
- Discord webhook integration
- Theme system (light/dark/Pokemon, team colours)
- Mobile polish pass
- Performance + caching pass

---

## 7. Key Business Rules

- Each forme is a separate draftable Pokemon (Mega Charizard X and Charizard are separate)
- Some formes share a base but are legal together (e.g. Alolan + Kantonian Ninetales) – tracked via `can_coexist_with`
- Mega + base forme can both be drafted but cannot both be brought to a single game (VGC rule – enforced at team builder level, not draft)
- Tiers and point costs are admin-set and lock when draft starts
- Draft order for season 1 is set by admin; subsequent seasons reverse or re-roll
- Waiver order starts as reverse draft order, updates weekly to worst record first
- Trades require a league vote (majority), admin can override
- Match results require both players to confirm OR admin confirmation
- Stats are season-isolated; league history aggregates across seasons
- Each season config is independent (format, points, required slots etc.)
- Keeper mechanic: config flag per season, if enabled admin designates keeper picks before draft

---

## 8. External Integrations

| Service | Usage |
|---|---|
| PokeAPI (pokeapi.co) | Initial species seeding (stats, types, sprites) |
| Showdown Replay API | Replay parsing for game stats |
| SMTP (configurable) | Email notifications |
| Discord Webhooks | League notifications to Discord server |
| Railway | Hosting (Postgres + web service) |

---

## 9. Notes for Claude Code

- Build iteratively phase by phase, do not attempt to scaffold everything at once
- All colours, copy, and league-specific config should be environment variable or DB driven, never hardcoded
- Use Alembic for database migrations
- Seed script for PokeAPI data should be idempotent (safe to re-run)
- WebSocket connection for draft should gracefully handle disconnects and reconnects
- Replay parser should fail gracefully and fall back to manual entry without breaking the result submission flow
- Stats views should be calculated/cached, not computed live on every page load for performance
- Mobile responsiveness is a first-class requirement, not an afterthought
- All admin actions should be logged for audit purposes

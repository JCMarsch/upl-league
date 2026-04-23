# UPL Site — Local Test Guide

## Setup

### Prerequisites
- Python 3.11+, Node 18+, PostgreSQL running locally

### Backend
```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# Ensure PostgreSQL has: createdb upl && createuser upl (password: upl, all privileges on upl)
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev   # runs on http://localhost:5173
```

The `.env.development` file points the frontend at `http://localhost:8000`.

---

## Test Checklist

### 1. Auth

- [ ] **Register**: Go to `/register`, create a new account. Confirm redirect to login.
- [ ] **Login**: Log in with those credentials. Confirm username appears in navbar.
- [ ] **Logout**: Click Logout. Confirm user is gone and protected routes redirect to login.
- [ ] **Session persistence**: Log in, refresh the page — user should still be logged in.
- [ ] **Protected routes**: While logged out, visit `/draft` and `/transactions` — should redirect to login.

---

### 2. Admin Setup (do this before testing anything else)

> You need an admin account and an active season to test most features.

- [ ] In the DB (or via a seed script), set your user's `roles` column to `admin,superadmin`.
- [ ] Go to `/admin` — confirm the admin panel is visible.
- [ ] **Create a season**: In the admin panel, create a season (e.g. "Season 1"). Set it as active.
- [ ] **Create teams**: Create at least 2 teams for the season, assigning managers.
- [ ] **Seed Pokémon**: Trigger the Pokémon seed (this hits PokeAPI and may take several minutes). Check progress in the admin panel.
- [ ] **Set tiers**: Go to the Tier List page, confirm Pokémon appear. In the admin tier editor, assign a few Pokémon to tiers (S, A, B, C, D, Unranked).

---

### 3. Pokémon Database (`/pokemon`)

- [ ] Page loads with a list of all seeded Pokémon.
- [ ] **Search**: Type a name in the search box — list filters correctly.
- [ ] **Type filter**: Select a type — only that type shows.
- [ ] **Generation filter**: Filter by generation — correct Pokémon shown.
- [ ] **Tier filter**: Filter by tier — only that tier shown.
- [ ] **Forme display**: Search "Typhlosion" — should see "Typhlosion" and "Typhlosion-Hisui" as separate entries (not both showing "Typhlosion").
- [ ] **Lycanroc**: Should show "Lycanroc-Midday", "Lycanroc-Midnight", "Lycanroc-Dusk" — not three rows called "Lycanroc".
- [ ] **Meowstic**: Should show "Meowstic-Male" and "Meowstic-Female".
- [ ] **Basculegion**: Should show "Basculegion-Male" and "Basculegion-Female".
- [ ] **Pikachu**: Only one "Pikachu" — no Pikachu-Original, Pikachu-Hoenn, etc.
- [ ] **Greninja**: Only "Greninja" — no "Greninja-Battle-Bond".
- [ ] **Castform**: Only "Castform" — no weather formes.
- [ ] **Rotom formes**: All 6 Rotom formes are present (Rotom, Rotom-Heat, Rotom-Wash, Rotom-Frost, Rotom-Fan, Rotom-Mow).
- [ ] **Mega display**: Mega Pokémon show correct name (e.g. "Charizard-Mega-X", "Charizard-Mega-Y").
- [ ] Click a Pokémon row — it should show base stats, types, sprite.

---

### 4. Tier List (`/tier-list`)

- [ ] Public tier list loads with tier columns (S, A, B, C, D) and an Unranked bar.
- [ ] Pokémon appear in the correct tier.
- [ ] **Admin edit mode** (while logged in as admin): a toggle or button to enter edit mode.
- [ ] In edit mode, drag a Pokémon from one tier to another — confirm it saves.
- [ ] Unranked bar visible above the tier columns on both public and admin views.

---

### 5. Draft Board (`/draft-board`)

- [ ] Page loads (no auth required).
- [ ] **Grid view**: Shows rounds as rows and teams as columns. Each cell has team colour, sprite, name, and a tier strip at bottom.
- [ ] **Teams view**: Toggle to "Teams" view — each team shows its Pokémon grouped by tier.
- [ ] If no picks have been made yet, grid shows empty cells with dimmed outlines.
- [ ] Snake direction arrows (← →) visible per round.
- [ ] Hovering a cell shows tooltip with type badges, stats, cost, pick number.
- [ ] Season selector (if multiple seasons exist).

---

### 6. Schedule (`/schedule`)

- [ ] Page loads with week accordions.
- [ ] Click a week header — it expands to show match cards.
- [ ] Click again — collapses.
- [ ] Current/most recent week auto-expands on load.
- [ ] **Filter tabs**: All / Upcoming / Completed — filter correctly.
- [ ] Match cards show: team names, score badge if completed, status chip.
- [ ] Click a match card — navigates to `/matches/{id}`.

> To test properly, create a match via the admin panel: go to Admin, find schedule management, create Week 1 and add a match between two teams.

---

### 7. Match Page (`/matches/:id`)

#### 7a. Display (already-submitted match)
- [ ] Score banner at top: "Team A N – M Team B", status badge.
- [ ] If no games submitted: shows "No detailed stats submitted yet."
- [ ] If games submitted: game tabs (Game 1, Game 2, etc.).
- [ ] Per-game tab: two columns of brought Pokémon with K/D, lead star (★), replay link.
- [ ] Kill timeline at bottom: "Turn N · Attacker used Move → KO'd Defender".

#### 7b. Submission wizard
- [ ] **Score step**: Enter games won for each side (e.g. 2–1). Click Next.
- [ ] **Game 1 step**: 
  - Paste a Showdown replay URL → click "Parse Replay" → brings pre-fill after a few seconds.
  - Bring grids show team rosters — click a sprite to cycle: none → brought → lead.
  - Kill events list populates from replay; "parsed" badges on auto-filled rows.
  - "Add Kill" button allows manual kill entry.
  - If side was parsed incorrectly, "Flip sides" button available.
- [ ] Without a replay URL: can manually select brought Pokémon and add kills.
- [ ] **Review step**: Shows summary of all games.
- [ ] **Submit**: Confirms data, submits. Match page reloads showing the submitted game data.

---

### 8. Draft (`/draft`) — Protected

- [ ] Loads draft room for the active season.
- [ ] Shows draft order, current pick, timer.
- [ ] When it's your team's turn, Pokémon selector is enabled — pick one.
- [ ] Picked Pokémon moves to team roster in the draft board on the right.
- [ ] Other teams' picks visible in real-time (or on refresh).

---

### 9. Teams (`/teams` and `/teams/:teamId`)

- [ ] `/teams` shows all teams for the current season.
- [ ] Click a team — navigates to team page.
- [ ] Team page shows: team name, manager, roster Pokémon with sprites and names.
- [ ] Pokémon names on roster show the correct forme name (not just base name).

---

### 10. Standings (`/standings`)

- [ ] Page loads with a standings table.
- [ ] Columns: Team, W, L, Win%, Points.
- [ ] Teams sorted by win% descending.
- [ ] If no matches played yet, all teams show 0-0.

---

### 11. Analytics (`/analytics`)

> Most sections will show "No data yet" empty states until matches with kill events are submitted.

- [ ] Page loads (no auth required).
- [ ] **Season filter** dropdown works — switching seasons updates all sections.
- [ ] **Move Kill Leaderboard**: Table shows top moves by KOs (or "No kill data yet").
- [ ] **Pokémon Matchup Matrix**: Heatmap renders (or empty state). Hovering a cell shows count.
- [ ] **Turn Distribution**: Bar chart of KOs per turn (or empty state).
- [ ] **Win Conditions**: Shows G1 win % stat (or "Insufficient data").
- [ ] After submitting a match with kill events (Step 7b above), refresh analytics — data should populate.

---

### 12. Awards & Records (`/awards`)

- [ ] Page loads (no auth required).
- [ ] **Records tab**: Shows record cards (or "No records yet" if no match data).
- [ ] **Wall of Fame tab**: Shows completed season champions (or "No completed seasons yet").
- [ ] **Season Awards tab**: Shows awards for the selected season.
- [ ] **Admin panel** (admin only): "Admin — Assign Award" panel visible.
  - Select award type (e.g. "MVP"), select a team, optionally add notes.
  - Click Assign — award appears in the Season Awards list.
  - Delete button (✕) on each award removes it.
- [ ] Season selector works if multiple seasons exist.

---

### 13. Transactions (`/transactions`) — Protected

- [ ] Page loads with three tabs: Log, Waivers, Trades.

#### Log tab
- [ ] Shows reverse-chronological feed of completed FAs and trades.
- [ ] Waiver entries: "Week N · TEAM dropped Pokémon, added Pokémon (FA)" with Pokémon names (not IDs).
- [ ] Trade entries: "TEAM-A ↔ TEAM-B traded X for Y" with Pokémon names.
- [ ] Filter bar: by team, by type (FA/trade), by week.

#### Waivers tab
- [ ] **Add Pokémon**: Type to search — typeahead dropdown appears with filtered Pokémon, showing tier badge and "drafted" label if already taken.
- [ ] Select a Pokémon to add, optionally select one to drop.
- [ ] Submit waiver — appears in the waivers list.
- [ ] Admin processes waiver: appears in Log tab after approval.

#### Trades tab
- [ ] **Propose trade**: Select target team, choose Pokémon to give (from your roster) and receive (from their roster) using typeahead search.
- [ ] Submit — trade appears with "pending" status.
- [ ] Other teams can vote approve/deny.
- [ ] Majority approval changes status to "approved".
- [ ] Admin confirms — trade status becomes "executed" and appears in Log tab.
- [ ] Cancel button visible on pending trades for the proposing team or admin.

---

### 14. Notifications (`/notifications`) — Protected

- [ ] Bell icon in navbar shows unread count badge.
- [ ] Click bell or visit `/notifications` — notification list appears.
- [ ] Mark as read — badge count decrements.
- [ ] Relevant actions (trade proposed to you, waiver processed) create notifications.

---

### 15. History (`/history` and `/history/:seasonId`)

- [ ] `/history` shows list of all seasons as cards.
- [ ] Completed seasons show champion and record.
- [ ] Click a season — `/history/:seasonId` shows detailed season recap.

---

### 16. Manager Page (`/managers/:userId`)

- [ ] Visit your own manager page via navbar username link.
- [ ] Shows all-time record, current team, past seasons.

---

### 17. Admin Panel (`/admin`)

- [ ] Accessible only to admin/superadmin roles.
- [ ] **Season management**: Create, edit, set active season.
- [ ] **Team management**: Create teams, assign managers.
- [ ] **Schedule management**: Create weeks, add matches.
- [ ] **Pokémon seed**: Trigger seed — progress shown. After seed, verify Pokémon appear in database.
- [ ] **Tier editor**: Same as tier list but with drag-and-drop enabled.
- [ ] **Waiver processing**: View pending waivers, approve or deny each.
- [ ] **Trade management**: Confirm or cancel approved trades.
- [ ] **Waiver order**: View/edit priority order.

---

## Known Issues to Watch For

- If the Pokémon seed is running and you navigate to the Pokémon page, it may show partial data — that's expected.
- The replay parser handles Showdown `.com/replay/*` URLs. If a replay is old/deleted, parsing will return an error — the manual path should still work.
- Reg M-A legality may flag some Pokémon incorrectly (Incineroar, Eeveelutions known issue) — this is a known bug in `REG_M_A_LEGAL` set, not a blocker.

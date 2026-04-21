# UPL Site - Manual Test Plan
## How to use this document
Work through each section after each major phase is built. Mark pass/fail and note any bugs. Re-run relevant sections after any major code change. Sections marked [HIGH RISK] are areas most likely to have bugs based on complexity or known issues from similar projects.

---

## SECTION 1 – Auth & Roles

### 1.1 Login
- [ ] Login with valid credentials → redirects to home
- [ ] Login with wrong password → shows error, does not log in
- [ ] Login with unknown username → shows error
- [ ] Logged in user visits /login → redirects away (already logged in)
- [ ] JWT expires → user is redirected to login, not stuck on broken page

### 1.2 Role enforcement
- [ ] Manager visiting /admin → redirected or shown 403
- [ ] Admin visiting /admin → access granted
- [ ] Logged out user visiting /my-team → redirected to login
- [ ] Viewer can see public pages without login
- [ ] After logout, back button does not restore session

### 1.3 Account management
- [ ] Admin creates new user account → user can log in
- [ ] Admin assigns manager role → user can now access manager pages
- [ ] Admin assigns admin role → user can now access admin pages
- [ ] Removing a role takes effect immediately (no stale session access)

---

## SECTION 2 – Season & Team Setup

### 2.1 Season creation
- [ ] Create season with all required fields → season appears in list
- [ ] Required slots config saves correctly (e.g. 1 Mega, 1 S tier)
- [ ] Points budget saves correctly
- [ ] Draft type (snake/auction) saves correctly
- [ ] Timer setting (with and without timer) saves correctly

### 2.2 Team setup
- [ ] Create 6 teams and assign different managers to each
- [ ] Two managers cannot be assigned to the same team in the same season
- [ ] Team logo uploads and displays correctly
- [ ] Team colours display on team page
- [ ] Teams appear in draft order list

---

## SECTION 3 – Tier & Legality Management

### 3.1 Tier assignment
- [ ] All legal Pokemon appear in the management table
- [ ] Admin can set tier for a Pokemon
- [ ] Admin can set point cost for a Pokemon
- [ ] Admin can mark Pokemon as illegal → disappears from selectable list
- [ ] Bulk update saves all changes, not just the last one edited
- [ ] Changes persist after page refresh

### 3.2 Tier locking [HIGH RISK]
- [ ] Lock tiers button requires confirmation
- [ ] After locking, tiers and costs are read-only for admin
- [ ] After locking, tiers and costs are read-only for managers
- [ ] Season status updates to draft-ready after lock
- [ ] Attempting to POST to bulk-update after lock returns 403
- [ ] Locking with Pokemon missing tier assignments → shows warning, does not allow lock
- [ ] Locked tiers still display correctly on public tier list page

---

## SECTION 4 – Draft Room [HIGH RISK]
This is the highest risk section. Test every scenario carefully.

### 4.1 Pre-draft
- [ ] Draft room shows correct pick order before draft starts
- [ ] Non-managers can view draft room but cannot make picks
- [ ] Draft does not start until admin clicks start
- [ ] Draft order displayed correctly for snake (round 2 should be reversed)

### 4.2 Basic picking
- [ ] When it is your turn, the pick button is active
- [ ] When it is NOT your turn, the pick button is disabled or hidden
- [ ] Picking a Pokemon removes it from the available list for all connected clients immediately
- [ ] Picked Pokemon appears on the correct team's roster in real time
- [ ] Pick number increments correctly after each pick
- [ ] Points remaining decreases correctly after each pick
- [ ] After a pick, the next team's pick button becomes active (not the same team again)

### 4.3 Snake draft order [HIGH RISK]
- [ ] Round 1: teams pick in order 1→6
- [ ] Round 2: teams pick in reverse order 6→1
- [ ] Round 3: back to 1→6
- [ ] After round 2 pick 1 (team 6), next pick is round 2 pick 2 (team 5), not team 6 again
- [ ] At the end of a round, the next round starts correctly
- [ ] Verify pick numbers match the draft board display

### 4.4 Timer [HIGH RISK] ← Known bug class
This is the exact bug type that caused cascading autopicks on the LoL site.

- [ ] Timer counts down correctly when it is a team's turn
- [ ] Timer RESETS when the next team's turn starts (does not carry over remaining time)
- [ ] Timer STOPS when a pick is made (does not keep counting down after pick)
- [ ] When timer expires for Team A: ONLY Team A's pick is auto-selected, timer then resets for Team B
- [ ] When timer expires for Team A and auto-pick fires: verify only ONE pick is made, not multiple
- [ ] Auto-pick selects the highest available Pokemon by tier (or lowest cost - confirm which)
- [ ] If two clients are connected and timer fires, only ONE auto-pick is made (not duplicate picks)
- [ ] Timer expiry during round transition: timer should not fire for the new round's first pick before that team connects
- [ ] Pausing the draft stops the timer
- [ ] Resuming the draft restarts the timer from where it paused (or resets to full - confirm which)
- [ ] Rapid clicking pick button during last second of timer does not cause double-pick

### 4.5 Disconnection handling [HIGH RISK]
- [ ] Manager disconnects mid-draft → timer continues (does not freeze)
- [ ] Manager reconnects mid-draft → sees correct current state (correct pick, timer, all previous picks)
- [ ] Admin disconnects and reconnects → admin controls still work
- [ ] Server restarts mid-draft → draft state is recoverable from DB (not lost from memory)
- [ ] Two browser tabs open for same manager → picking in one tab, other tab updates correctly, pick button in second tab becomes disabled

### 4.6 Points validation
- [ ] Cannot draft a Pokemon that costs more than remaining points
- [ ] Required slot validation: if 1 Mega is required and no Megas remain in budget, show warning
- [ ] Pokemon that would make required slots impossible to fill are flagged
- [ ] Draft completion: all teams must meet required slot minimums before draft can close

### 4.7 Auction draft (if used)
- [ ] Only one Pokemon up for nomination at a time
- [ ] Bids deduct correctly from budget
- [ ] Timer works the same way as above (no cascading)
- [ ] Minimum bid is 1 point
- [ ] Cannot bid more than remaining budget
- [ ] Winning bid assigns Pokemon to correct team

### 4.8 Admin draft controls
- [ ] Admin can pause draft → all clients see paused state, picks disabled
- [ ] Admin can resume draft → picks re-enabled for correct team
- [ ] Admin can manually override a pick (replace with different Pokemon)
- [ ] Override updates all clients in real time

---

## SECTION 5 – Team Pages

### 5.1 Public view
- [ ] All 6 drafted Pokemon display with correct sprites
- [ ] Type weaknesses are calculated correctly (test with a known team)
- [ ] Average base stats radar chart shows correct values
- [ ] Trophy cabinet is empty before any awards are given
- [ ] Upcoming schedule shows correct opponents

### 5.2 Private view (manager)
- [ ] Edit mode allows changing moves, ability, item, tera type
- [ ] Saving edits persists after page refresh
- [ ] Another manager cannot edit your team (should see read-only view)
- [ ] Admin can edit any team
- [ ] Private team builder is NOT visible when logged out or as a different manager

### 5.3 Edge cases
- [ ] Team page with a waivered Pokemon (asterisk or indicator shows correctly)
- [ ] Team page mid-draft (some slots empty) → empty slots display gracefully, no crashes
- [ ] Team with Mega + base forme both drafted → both show on team page

---

## SECTION 6 – Schedule & Match Submission

### 6.1 Schedule generation
- [ ] Schedule generates correct number of weeks for player count
- [ ] No team plays itself
- [ ] Each team plays every other team exactly once (round robin)
- [ ] Re-generating schedule overwrites old one with confirmation

### 6.2 Result submission
- [ ] Winner submits result with replay URLs → status shows "pending confirmation"
- [ ] Loser (or any player) sees confirmation prompt
- [ ] Confirming result → status changes to confirmed, stats update
- [ ] Submitting wrong result → opponent can dispute (flag for admin)
- [ ] Admin can confirm result directly (bypasses player confirmation)
- [ ] Cannot submit result for a match that is already confirmed
- [ ] Replay URL field accepts Showdown URL format
- [ ] Submitting without replay URL is allowed (but flagged)

### 6.3 Stats entry
- [ ] Entering kills/deaths per Pokemon saves correctly
- [ ] Direct + passive kills sum to total kills correctly
- [ ] Stats are attributed to the correct team's Pokemon
- [ ] Stats update on standings page after confirmation

### 6.4 Edge cases
- [ ] Both players submit conflicting results → dispute state, admin must resolve
- [ ] Admin edits a confirmed result → stats recalculate correctly
- [ ] Draw result (1-1 in BO3) saves correctly and shows as draw in standings

---

## SECTION 7 – Standings & Stats

### 7.1 Standings accuracy
- [ ] W/L/D counts match actual confirmed results
- [ ] Game differential (+/-) is sum of (pokemon KOs for - pokemon KOs against) across all games
- [ ] Match differential is sum of (games won - games lost) across all matches
- [ ] Kills and deaths match sum of all game_stats entries for that team
- [ ] Win percentage is wins / total matches played (not total games)

### 7.2 Tiebreaker logic [HIGH RISK]
Run this test with two teams manually set to equal win%:
- [ ] Two teams with same W% → higher wins breaks tie
- [ ] Two teams with same W% and wins → higher +/- breaks tie
- [ ] Two teams with same W%, wins, +/- → H2H record breaks tie
- [ ] Two teams who haven't played each other yet and are tied → falls through to next tiebreaker
- [ ] Alphabetical is always the final fallback and never leaves a tie

### 7.3 Pokemon / MVP list
- [ ] Most total kills ranks #1
- [ ] Two Pokemon with same kills → higher +/- ranks above
- [ ] Undrafted Pokemon that appeared via FA show correctly (team = FREE AGENCY)
- [ ] Pokemon with 0 games played still appear in database, just ranked last

### 7.4 Live updates
- [ ] Standings update within 60 seconds of a result being confirmed (or immediately)
- [ ] Pokemon stats update after confirmation
- [ ] No stale cached data shown after update

---

## SECTION 8 – Transactions

### 8.1 Waivers
- [ ] Manager submits waiver claim → appears in pending list for admin
- [ ] Manager can specify a drop alongside the add
- [ ] Waiver claim validates: cannot claim a drafted Pokemon
- [ ] Waiver claim validates: add + drop must keep team within roster size
- [ ] Waiver claim validates: cannot exceed points budget on add
- [ ] Admin approves claim → Pokemon moves to team roster, drop removed
- [ ] Admin denies claim → Pokemon stays undrafted
- [ ] After week rollover, waiver order updates (worst record moves to top)
- [ ] Waiver order displayed correctly to all managers

### 8.2 Waiver order [HIGH RISK]
- [ ] Initial order is reverse draft order (last pick = first waiver priority)
- [ ] After week 1: team with worst record gets priority 1
- [ ] Teams with same record → use standings tiebreaker for waiver order
- [ ] Using a waiver claim moves you to the bottom of the waiver order
- [ ] Team that does not use a claim keeps their position relative to others
- [ ] Waiver order resets/updates weekly, not after each individual claim

### 8.3 Trades
- [ ] Manager can propose a trade (select Pokemon to give and receive, select trade partner)
- [ ] Trade partner receives notification
- [ ] All teams can see pending trade and cast a vote
- [ ] Each team gets exactly one vote
- [ ] Cannot vote on your own trade (proposing or receiving team may or may not vote - confirm rules)
- [ ] Trade passes when majority vote approve
- [ ] Trade fails when majority vote deny
- [ ] Trade confirmed by admin → rosters update correctly for both teams
- [ ] Points budgets update correctly after trade (if applicable)
- [ ] Cancelled trade → votes cleared, Pokemon not moved
- [ ] Two trades involving the same Pokemon simultaneously → second should be blocked or queued

---

## SECTION 9 – Replay Parser

### 9.1 Basic parsing
- [ ] Valid Showdown replay URL parses without error
- [ ] Leads (first 2 Pokemon per side) correctly identified
- [ ] All 4 brought Pokemon correctly identified
- [ ] Direct kills (KO from move) counted correctly
- [ ] Passive kills (KO from status/hazard/weather) counted correctly
- [ ] KOs attributed to the correct team (not reversed)

### 9.2 Edge cases
- [ ] Pokemon faints from recoil (e.g. Double-Edge) → counts as passive kill for opponent
- [ ] Pokemon faints from struggle → counts as passive
- [ ] Pokemon faints from poison outside of attacker's turn → passive
- [ ] Pokemon faints on the same turn from both a move and residual (rare) → direct takes precedence
- [ ] A Pokemon switches in and immediately faints from hazards → passive death, credited correctly
- [ ] Game with a forfeit → parser handles gracefully
- [ ] Invalid replay URL → graceful error, manual entry fallback shown
- [ ] Private/deleted replay URL → graceful error, not a crash
- [ ] Replay from wrong format (Singles parsed on VGC season) → warning shown

### 9.3 Integration
- [ ] Parsed stats pre-populate the submission form
- [ ] Manager can edit parsed stats before submitting
- [ ] Corrected stats save as-entered, not overwritten by parser again
- [ ] If parse fails, manual entry still works normally

---

## SECTION 10 – Multi-Season & History

### 10.1 Season isolation
- [ ] Season 1 stats do not appear in Season 2 standings
- [ ] Season 1 Pokemon rosters do not carry to Season 2 (unless keeper enabled)
- [ ] Closing Season 1 does not affect Season 2 if it is already in progress
- [ ] A manager's Season 1 record is visible on their career page but not in Season 2 standings

### 10.2 History accuracy
- [ ] All-time kills leaderboard sums correctly across seasons
- [ ] Career page shows correct season-by-season breakdown
- [ ] Champion is correctly recorded for each season
- [ ] Pokemon that appeared in multiple seasons show combined league stats on their Pokemon page

### 10.3 Awards
- [ ] Auto-calculated awards fire correctly at season close
- [ ] Champion award goes to the correct team
- [ ] Custom awards admin creates appear on the correct team's trophy cabinet
- [ ] Award icons display on team page trophy cabinet
- [ ] Historical awards visible on league history page

---

## SECTION 11 – Notifications

### 11.1 In-app
- [ ] Bell icon shows unread count badge
- [ ] Draft pick notification fires when you are 2 picks away
- [ ] Draft pick notification fires when it is your turn
- [ ] Trade proposal notification fires for the receiving team
- [ ] Result submitted notification fires for the opponent
- [ ] Marking notification as read removes badge count
- [ ] Old notifications persist in the notification centre

### 11.2 Email
- [ ] Email sends for draft turn notification
- [ ] Email sends for trade proposal
- [ ] Email sends for result needing confirmation
- [ ] User can opt out of email notifications in settings
- [ ] Opted-out user does not receive email but still gets in-app notification

### 11.3 Discord
- [ ] Draft pick fires webhook
- [ ] Trade approved fires webhook
- [ ] Match result confirmed fires webhook
- [ ] Webhook fires to correct channel URL
- [ ] If webhook URL is invalid, error is logged but site does not crash

---

## SECTION 12 – General & Edge Cases

### 12.1 Concurrent users
- [ ] Two managers loading the standings page simultaneously → both see correct data
- [ ] Two managers submitting different results at the same time → no data corruption
- [ ] Admin and manager editing different things simultaneously → no conflicts

### 12.2 Data integrity
- [ ] Deleting a team (if admin can do this) → orphaned records handled
- [ ] Pokemon that was waivered then traded → full transaction history shows correctly
- [ ] A result that is edited after stats were already calculated → stats recalculate, old values not left behind

### 12.3 Mobile
- [ ] Standings table scrolls horizontally on mobile without breaking layout
- [ ] Team page readable on mobile
- [ ] Draft room usable on mobile (pick button reachable, timer visible)
- [ ] Nav menu opens and closes on mobile
- [ ] Trade centre usable on mobile

### 12.4 Empty states
- [ ] Season with no results yet → standings shows all teams at 0-0-0, no crashes
- [ ] Team with no Pokemon yet (mid-draft) → team page shows empty state gracefully
- [ ] No upcoming matches → schedule section shows "no upcoming matches" not blank space or error
- [ ] Pokemon with 0 stats → shows 0s not blank cells or NaN

---

## REGRESSION CHECKLIST
Run these after ANY significant code change:

- [ ] Login and logout work
- [ ] Draft room connects and shows current state
- [ ] Picking a Pokemon updates all clients
- [ ] Timer fires once per pick, not cascading
- [ ] Standings calculate correctly
- [ ] Team page loads with correct roster
- [ ] Match submission and confirmation flow works end to end
- [ ] Waiver order is correct after weekly update

---

## KNOWN BUG PATTERNS TO WATCH FOR

**Cascading autopick (the LoL bug):**
Root cause is usually a timer that is set on a shared state object and not properly cleared when a pick is made or when the turn changes. The timer fires, makes a pick, which should then clear and reset the timer for the next player - but if the clear happens after the next timer is set, you get a race condition.
Fix: timer must be cleared BEFORE the pick is processed. Use a single source of truth for whose turn it is. Never start the next timer until the current pick is fully committed to DB.

**Stale WebSocket state:**
After a reconnect, the client might show the draft board from when they disconnected. Always send full draft state on reconnect, not just the delta.

**Double-submission on slow connections:**
User clicks submit, nothing happens (slow response), clicks again. Fix: disable submit button immediately on first click, re-enable only on error.

**Stats not recalculating after admin edit:**
If admin edits a result and a cached stats view is not invalidated, old stats show until next cache refresh. Fix: always invalidate cache on result update, not just on result creation.

**Waiver order not updating:**
If the weekly waiver order update job fails silently, managers see wrong priority all week. Add explicit logging and an admin "force refresh waiver order" button as a safety valve.

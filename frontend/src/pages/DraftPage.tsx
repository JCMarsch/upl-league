import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useActiveSeason } from '../hooks/useActiveSeason'
import { TIERS, TIER_COLORS, MEGA_BANNER_COLORS } from '../constants/tiers'

interface DraftState {
  id: number
  season_id: number
  status: string
  current_pick_number: number
  current_team_id: number | null
  timer_seconds: number | null
  pick_started_at: string | null
}

interface DraftPick {
  pick_number: number
  round_number: number
  team_id: number
  season_pokemon_id: number
  picked_at: string
}

interface SeasonPokemon {
  id: number
  species_id: number
  tier: string | null
  point_cost: number | null
  is_legal: boolean
  is_mega: boolean | null
  drafted_by_team_id: number | null
  species_name: string | null
  species_sprite_url: string | null
  species_type1: string | null
  species_type2: string | null
}

interface Team {
  id: number
  name: string
  abbreviation: string | null
  points_remaining: number
  manager_id: number
}

const TYPE_COLORS: Record<string, string> = {
  Fire: '#EE8130', Water: '#6390F0', Grass: '#7AC74C', Electric: '#F7D02C',
  Ice: '#96D9D6', Fighting: '#C22E28', Poison: '#A33EA1', Ground: '#E2BF65',
  Flying: '#A98FF3', Psychic: '#F95587', Bug: '#A6B91A', Rock: '#B6A136',
  Ghost: '#735797', Dragon: '#6F35FC', Dark: '#705746', Steel: '#B7B7CE',
  Fairy: '#D685AD', Normal: '#A8A77A',
}

function getNextTeamId(teamIds: number[], pickNum: number): number | null {
  if (!teamIds.length) return null
  const n = teamIds.length
  const idx = pickNum - 1
  const round = Math.floor(idx / n) + 1
  const pos = idx % n
  return round % 2 === 1 ? teamIds[pos] : teamIds[n - 1 - pos]
}

function getTimeLeft(draftState: DraftState): number | null {
  if (!draftState.timer_seconds || !draftState.pick_started_at) return null
  const startMs = new Date(draftState.pick_started_at).getTime()
  const expiryMs = startMs + draftState.timer_seconds * 1000
  return Math.max(0, Math.ceil((expiryMs - Date.now()) / 1000))
}

export default function DraftPage() {
  const { user } = useAuthStore()
  const { seasonId } = useActiveSeason()
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [pokemon, setPokemon] = useState<SeasonPokemon[]>([])
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [megaTab, setMegaTab] = useState(false)
  const [picking, setPicking] = useState(false)
  const [msg, setMsg] = useState('')
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [pendingPick, setPendingPick] = useState<SeasonPokemon | null>(null)
  const [draftOrderTeamIds, setDraftOrderTeamIds] = useState<number[]>([])
  const [rosterSize, setRosterSize] = useState(10)
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isAdmin = user && (user.roles.includes('admin') || user.roles.includes('superadmin'))
  const myTeam = teams.find(t => t.manager_id === user?.id)
  const isMyTurn = draftState?.current_team_id === myTeam?.id
  const pickingTeam = teams.find(t => t.id === draftState?.current_team_id)

  const canPick = draftState?.status === 'active' && (isMyTurn || isAdmin)

  const nextPickNum = draftState && draftState.status === 'active' ? draftState.current_pick_number + 1 : null
  const nextTeamId = nextPickNum && draftOrderTeamIds.length ? getNextTeamId(draftOrderTeamIds, nextPickNum) : null

  const fetchState = useCallback(async () => {
    if (!seasonId) return
    const [stateRes, pokemonRes, teamsRes, orderRes, seasonRes] = await Promise.all([
      axios.get(`/draft/${seasonId}/state`).catch(() => null),
      axios.get(`/seasons/${seasonId}/pokemon`),
      axios.get(`/seasons/${seasonId}/teams`),
      axios.get(`/draft/${seasonId}/order`).catch(() => ({ data: [] })),
      axios.get(`/seasons`).catch(() => ({ data: [] })),
    ])
    if (stateRes) setDraftState(stateRes.data)
    setPokemon(pokemonRes.data)
    setTeams(teamsRes.data)
    if (orderRes.data.length > 0) {
      setDraftOrderTeamIds(orderRes.data.map((o: { team_id: number }) => o.team_id))
    }
    const season = seasonRes.data.find((s: any) => s.id === seasonId)
    if (season?.roster_size) setRosterSize(season.roster_size)
  }, [seasonId])

  useEffect(() => {
    if (!seasonId) { setLoading(false); return }
    fetchState().finally(() => setLoading(false))
  }, [seasonId, fetchState])

  // Timer — synced from server pick_started_at
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (draftState?.status === 'active' && draftState.timer_seconds && draftState.pick_started_at) {
      setTimeLeft(getTimeLeft(draftState))
      timerRef.current = setInterval(() => {
        setTimeLeft(getTimeLeft(draftState))
      }, 500)
    } else {
      setTimeLeft(null)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [draftState?.status, draftState?.current_pick_number, draftState?.pick_started_at])

  // WebSocket
  useEffect(() => {
    if (!seasonId) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.host
    const ws = new WebSocket(`${proto}://${host}/draft/ws/${seasonId}`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'pick') {
        // Apply update locally — no round-trip needed
        if (msg.state) setDraftState(msg.state)
        if (msg.drafted_pokemon_id && msg.team_id != null) {
          setPokemon(prev => prev.map(p =>
            p.id === msg.drafted_pokemon_id ? { ...p, drafted_by_team_id: msg.team_id } : p
          ))
        }
        if (msg.team_id != null && msg.points_remaining != null) {
          setTeams(prev => prev.map(t =>
            t.id === msg.team_id ? { ...t, points_remaining: msg.points_remaining } : t
          ))
        }
        if (msg.pick) setPicks(prev => [...prev, msg.pick])
        setPendingPick(null)
      } else if (msg.type === 'state_change') {
        fetchState()
        setPendingPick(null)
      }
    }
    ws.onclose = () => {
      setTimeout(() => { fetchState() }, 2000)
    }
    return () => ws.close()
  }, [seasonId, fetchState])

  const confirmPick = async () => {
    if (!pendingPick || !seasonId) return
    setPicking(true); setMsg('')
    try {
      const { data } = await axios.post(
        `/draft/${seasonId}/pick`,
        { season_pokemon_id: pendingPick.id },
        { withCredentials: true },
      )
      // Update everything locally from the response — no extra fetches
      setDraftState(data.state)
      setPokemon(prev => prev.map(p =>
        p.id === data.drafted_pokemon_id ? { ...p, drafted_by_team_id: data.team_id } : p
      ))
      setTeams(prev => prev.map(t =>
        t.id === data.team_id ? { ...t, points_remaining: data.points_remaining } : t
      ))
      setPicks(prev => [...prev, data.pick])
      setPendingPick(null)
      // Broadcast to other clients with full pick data so they can also update locally
      wsRef.current?.send(JSON.stringify({
        type: 'pick',
        state: data.state,
        drafted_pokemon_id: data.drafted_pokemon_id,
        team_id: data.team_id,
        points_remaining: data.points_remaining,
        pick: data.pick,
      }))
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Pick failed')
    } finally { setPicking(false) }
  }

  const startDraft = async () => {
    if (!seasonId) return
    try {
      await axios.post(`/draft/${seasonId}/start`, {}, { withCredentials: true })
      await fetchState()
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed to start') }
  }

  const pauseResume = async () => {
    if (!seasonId || !draftState) return
    const endpoint = draftState.status === 'active' ? 'pause' : 'resume'
    try {
      await axios.post(`/draft/${seasonId}/${endpoint}`, {}, { withCredentials: true })
      await fetchState()
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
  }

  const resetDraft = async () => {
    if (!seasonId) return
    if (!window.confirm('Reset the entire draft? This will undo ALL picks and restore all team budgets. This cannot be undone.')) return
    try {
      await axios.post(`/draft/${seasonId}/reset`, {}, { withCredentials: true })
      setPendingPick(null)
      setPicks([])
      await fetchState()
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Reset failed') }
  }

  // Compute structural slot assignments for a team's drafted pokemon
  const SLOT_ORDER = ['Mega', 'S', 'A', 'B', 'C', 'D'] as const
  const freeSlotCount = Math.max(0, rosterSize - 6)

  function assignSlots(teamId: number) {
    const drafted = pokemon.filter(p => p.drafted_by_team_id === teamId)
    const slots: Record<string, SeasonPokemon | null> = { Mega: null, S: null, A: null, B: null, C: null, D: null }
    const free: (SeasonPokemon | null)[] = Array(freeSlotCount).fill(null)
    for (const p of drafted) {
      if (p.is_mega) {
        if (!slots.Mega) { slots.Mega = p; continue }
      }
      const tier = p.tier ?? ''
      if ((tier === 'S' || tier === 'A' || tier === 'B' || tier === 'C' || tier === 'D') && !slots[tier]) {
        slots[tier] = p
      } else {
        const emptyFree = free.findIndex(f => f === null)
        if (emptyFree >= 0) free[emptyFree] = p
      }
    }
    return { slots, free }
  }

  const available = pokemon.filter(p => p.is_legal && !p.drafted_by_team_id)
  const tabAvailable = megaTab
    ? available.filter(p => p.is_mega)
    : available.filter(p => !p.is_mega)
  const regularTiers = TIERS.filter(t => t !== 'Mega')
  const filtered = tabAvailable.filter(p => {
    if (tierFilter && p.tier !== tierFilter) return false
    if (search && !p.species_name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const teamName = (id: number | null) => id ? (teams.find(t => t.id === id)?.name ?? `Team ${id}`) : '—'

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading draft...</div>

  if (!draftState) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Draft Room</h1>
        <div className="p-8 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <p className="text-lg font-semibold mb-4">Draft has not been set up yet.</p>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>Before the draft can begin, an admin must complete these steps:</p>
          <ol className="space-y-2 mb-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--color-primary)' }}>1.</span> Import all Pokemon and apply a regulation preset (Admin → Pokemon table)</li>
            <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--color-primary)' }}>2.</span> Assign every legal Pokemon to a tier — either via drag-and-drop or CSV upload (Admin → Tier List)</li>
            <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--color-primary)' }}>3.</span> Lock tiers once assignments are complete (Admin → Pokemon table → Lock Tiers)</li>
            <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--color-primary)' }}>4.</span> Ensure at least one team is registered for this season (Admin → Seasons)</li>
            <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--color-primary)' }}>5.</span> Set the draft order (Admin → Draft Order) — this creates the draft room</li>
          </ol>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Contact your league admin to get this set up.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Pre-start ready room banner */}
      {draftState.status === 'pending' && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border-2" style={{ borderColor: 'var(--color-primary)', background: 'var(--color-surface)' }}>
          <div>
            <div className="font-bold text-lg">Draft Room — Waiting to Start</div>
            <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              All managers can see this page. When everyone is ready, click START DRAFT.
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={startDraft}
              className="px-6 py-2 rounded text-white font-bold text-sm flex-shrink-0"
              style={{ background: 'var(--color-primary)', letterSpacing: '0.05em' }}
            >
              START DRAFT
            </button>
          )}
          {!isAdmin && (
            <span className="text-sm font-medium px-4 py-2 rounded" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              Waiting for admin to start…
            </span>
          )}
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div>
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Pick #{draftState.current_pick_number} · Status: {draftState.status}
          </div>
          <div className="text-lg font-bold mt-0.5">
            {draftState.status === 'active' ? (
              <>
                <span className={isMyTurn ? 'text-green-500' : ''}>
                  On the clock: {teamName(draftState.current_team_id)}
                </span>
                {isAdmin && pickingTeam && (
                  <span className="ml-2 text-sm font-normal px-2 py-0.5 rounded" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                    Picking for: {pickingTeam.name}
                  </span>
                )}
                {isMyTurn && !isAdmin && (
                  <span className="ml-2 text-green-500 text-sm"> ← Your pick!</span>
                )}
              </>
            ) : draftState.status === 'paused' ? (
              '⏸ Draft Paused'
            ) : draftState.status === 'complete' ? (
              '✅ Draft Complete'
            ) : (
              'Draft not started'
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {timeLeft !== null && (
            <div className="text-2xl font-mono font-bold" style={{ color: timeLeft < 30 ? '#ef4444' : timeLeft < 60 ? '#f59e0b' : 'var(--color-text)' }}>
              {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
            </div>
          )}
          {isAdmin && draftState.status !== 'complete' && draftState.status !== 'pending' && (
            <button onClick={pauseResume} className="px-3 py-1.5 text-sm border rounded" style={{ borderColor: 'var(--color-border)' }}>
              {draftState.status === 'active' ? 'Pause' : 'Resume'}
            </button>
          )}
          {isAdmin && (
            <button onClick={resetDraft} className="px-3 py-1.5 text-sm border rounded" style={{ borderColor: '#ef4444', color: '#ef4444' }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Pending pick confirmation banner */}
      {pendingPick && (
        <div className="flex items-center justify-between gap-4 p-3 rounded-xl border-2" style={{ borderColor: 'var(--color-primary)', background: 'var(--color-surface)' }}>
          <div className="flex items-center gap-3">
            {pendingPick.species_sprite_url && (
              <img src={pendingPick.species_sprite_url} alt={pendingPick.species_name ?? ''} className="w-12 h-12 object-contain" />
            )}
            <div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Confirm pick?</div>
              <div className="font-bold">{pendingPick.species_name}</div>
              <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {pendingPick.tier} · {pendingPick.point_cost ?? '?'} pts
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={confirmPick}
              disabled={picking}
              className="px-4 py-2 rounded text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: '#22c55e' }}
            >
              {picking ? 'Picking…' : 'Confirm'}
            </button>
            <button
              onClick={() => setPendingPick(null)}
              className="px-4 py-2 rounded text-sm border"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && <p className="text-sm text-red-500">{msg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Available Pokemon */}
        <div className="lg:col-span-2 space-y-3">
          {/* Mega / Regular tabs */}
          <div className="flex gap-0 border rounded-lg overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
            <button
              onClick={() => { setMegaTab(false); setTierFilter('') }}
              className="flex-1 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: !megaTab ? 'var(--color-primary)' : 'var(--color-surface)',
                color: !megaTab ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              Regular ({available.filter(p => !p.is_mega).length})
            </button>
            <button
              onClick={() => { setMegaTab(true); setTierFilter('') }}
              className="flex-1 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: megaTab ? TIER_COLORS['Mega'].label : 'var(--color-surface)',
                color: megaTab ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              Mega ({available.filter(p => p.is_mega).length})
            </button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <input
              placeholder="Search Pokemon..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 border rounded px-3 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            />
            {!megaTab && (
              <select
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                <option value="">All Tiers</option>
                {regularTiers.map(t => <option key={t}>{t}</option>)}
              </select>
            )}
          </div>

          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{filtered.length} available</div>

          <div className="overflow-y-auto border rounded-lg" style={{ borderColor: 'var(--color-border)', maxHeight: '60vh' }}>
            {regularTiers.map(tier => {
              const tierPokemon = filtered.filter(p => p.tier === tier)
              if (tierPokemon.length === 0) return null
              return (
                <div key={tier}>
                  <div className="sticky top-0 px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                    Tier {tier}
                  </div>
                  {tierPokemon.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2 border-b"
                      style={{
                        borderColor: 'var(--color-border)',
                        background: pendingPick?.id === p.id ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))' : undefined,
                      }}
                    >
                      {p.species_sprite_url && (
                        <img src={p.species_sprite_url} alt={p.species_name ?? ''} className="w-10 h-10 object-contain flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{p.species_name}</div>
                        <div className="flex gap-1 mt-0.5">
                          {p.species_type1 && (
                            <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: TYPE_COLORS[p.species_type1] ?? '#888' }}>{p.species_type1}</span>
                          )}
                          {p.species_type2 && (
                            <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: TYPE_COLORS[p.species_type2] ?? '#888' }}>{p.species_type2}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-mono">{p.point_cost ?? '?'} pts</div>
                        {canPick && (
                          <button
                            onClick={() => setPendingPick(p)}
                            disabled={picking || pendingPick?.id === p.id}
                            className="text-xs px-2 py-0.5 rounded text-white mt-1 disabled:opacity-50"
                            style={{ background: pendingPick?.id === p.id ? '#6b7280' : 'var(--color-primary)' }}
                          >
                            {pendingPick?.id === p.id ? 'Selected' : 'Pick'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
            {filtered.filter(p => !p.tier).length > 0 && (
              <div>
                <div className="sticky top-0 px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>Untiered</div>
                {filtered.filter(p => !p.tier).map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    {p.species_sprite_url && <img src={p.species_sprite_url} alt={p.species_name ?? ''} className="w-10 h-10 object-contain" />}
                    <div className="flex-1"><div className="font-medium text-sm">{p.species_name}</div></div>
                    <div className="text-sm font-mono">{p.point_cost ?? '?'} pts</div>
                    {canPick && (
                      <button
                        onClick={() => setPendingPick(p)}
                        disabled={picking || pendingPick?.id === p.id}
                        className="text-xs px-2 py-0.5 rounded text-white disabled:opacity-50"
                        style={{ background: 'var(--color-primary)' }}
                      >
                        Pick
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Teams panel */}
        <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '70vh' }}>
          {teams.map(team => {
            const isCurrentPick = team.id === draftState.current_team_id && draftState.status === 'active'
            const isNextPick = team.id === nextTeamId && team.id !== draftState.current_team_id
            return (
            <div
              key={team.id}
              className="border rounded-lg overflow-hidden"
              style={{
                borderColor: isCurrentPick ? 'var(--color-primary)' : 'var(--color-border)',
                background: 'var(--color-surface)',
                boxShadow: isCurrentPick ? '0 0 0 2px var(--color-primary)33' : 'none',
              }}
            >
              {isNextPick && (
                <div className="text-center text-xs font-black py-0.5 tracking-widest"
                  style={{ background: '#f59e0b', color: '#1c1917' }}>
                  NEXT PICK
                </div>
              )}
              <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm">{team.name}</div>
                <div className="text-xs font-mono" style={{ color: 'var(--color-primary)' }}>{team.points_remaining} pts</div>
              </div>
              {/* Structured slots — mirrors the Excel layout */}
              <div className="space-y-1">
                {/* Required slots row */}
                <div className="flex gap-1">
                  {(() => {
                    const { slots, free } = assignSlots(team.id)
                    return (
                      <>
                        {SLOT_ORDER.map(slotKey => {
                          const p = slots[slotKey]
                          const isMegaSlot = slotKey === 'Mega'
                          const slotColor = isMegaSlot
                            ? (p ? (MEGA_BANNER_COLORS[p.tier ?? ''] ?? '#7c3aed') : '#7c3aed')
                            : (TIER_COLORS[slotKey]?.label ?? '#9ca3af')
                          const pickNum = p ? picks.find(pk => pk.season_pokemon_id === p.id)?.pick_number : undefined
                          return (
                            <div key={slotKey} className="relative flex-shrink-0"
                              style={{ width: 38, height: 46 }}
                              title={p ? `#${pickNum ?? '?'} ${p.species_name} · ${p.point_cost ?? '?'}pts` : `${slotKey} slot — empty`}>
                              <div className="absolute inset-0 rounded border"
                                style={{
                                  borderColor: slotColor,
                                  background: p ? 'transparent' : 'color-mix(in srgb, var(--color-bg) 80%, transparent)',
                                  opacity: p ? 1 : 0.6,
                                }} />
                              {p ? (
                                <>
                                  <img src={p.species_sprite_url ?? ''} alt={p.species_name ?? ''} className="w-full h-8 object-contain pt-0.5" />
                                  {pickNum !== undefined && (
                                    <span className="absolute top-0 left-0 text-[7px] font-bold leading-none px-0.5 rounded-br"
                                      style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}>{pickNum}</span>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center justify-center h-8">
                                  <span className="text-[8px]" style={{ color: slotColor, opacity: 0.7 }}>—</span>
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 text-center text-[7px] font-bold rounded-b"
                                style={{ background: slotColor, color: '#fff', lineHeight: '11px' }}>
                                {slotKey}
                              </div>
                            </div>
                          )
                        })}
                        {/* Free slots */}
                        {free.map((p, i) => {
                          const pickNum = p ? picks.find(pk => pk.season_pokemon_id === p.id)?.pick_number : undefined
                          const tColor = p
                            ? (p.is_mega ? (MEGA_BANNER_COLORS[p.tier ?? ''] ?? '#7c3aed') : (TIER_COLORS[p.tier ?? '']?.label ?? '#9ca3af'))
                            : '#9ca3af'
                          return (
                            <div key={`free-${i}`} className="relative flex-shrink-0"
                              style={{ width: 38, height: 46 }}
                              title={p ? `#${pickNum ?? '?'} ${p.species_name} (free pick) · ${p.point_cost ?? '?'}pts` : 'Free slot — empty'}>
                              <div className="absolute inset-0 rounded border"
                                style={{
                                  borderColor: p ? tColor : 'var(--color-border)',
                                  background: p ? 'transparent' : 'color-mix(in srgb, var(--color-bg) 80%, transparent)',
                                  opacity: p ? 1 : 0.5,
                                }} />
                              {p ? (
                                <>
                                  <img src={p.species_sprite_url ?? ''} alt={p.species_name ?? ''} className="w-full h-8 object-contain pt-0.5" />
                                  {pickNum !== undefined && (
                                    <span className="absolute top-0 left-0 text-[7px] font-bold leading-none px-0.5 rounded-br"
                                      style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}>{pickNum}</span>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center justify-center h-8">
                                  <span className="text-[8px]" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>—</span>
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 text-center text-[7px] font-bold rounded-b"
                                style={{ background: p ? tColor : 'var(--color-border)', color: '#fff', lineHeight: '11px' }}>
                                {p ? (p.tier ?? '?') : 'FREE'}
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}
                </div>
              </div>
              </div>
            </div>
          )
          })}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useActiveSeason } from '../hooks/useActiveSeason'
import { TIERS, MEGA_BANNER_COLORS } from '../constants/tiers'

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

// Dark draft room color tokens
const D = {
  bg: '#0d1117',
  surface: '#161b22',
  elevated: '#1c2333',
  border: '#30363d',
  text: '#e6edf3',
  muted: '#7d8590',
  amber: '#f59e0b',
  green: '#238636',
  red: '#da3633',
} as const

// Tier badge styles tuned for dark backgrounds
const TIER_DARK: Record<string, { bg: string; color: string }> = {
  Mega: { bg: '#7c3aed', color: '#fff' },
  S:    { bg: '#b91c1c', color: '#fff' },
  A:    { bg: '#c2410c', color: '#fff' },
  B:    { bg: '#a16207', color: '#fff' },
  C:    { bg: '#15803d', color: '#fff' },
  D:    { bg: '#1d4ed8', color: '#fff' },
  Free: { bg: '#374151', color: '#9ca3af' },
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

// ── Pokemon row ──────────────────────────────────────────────────────────────

interface PokemonRowProps {
  p: SeasonPokemon
  canPick: boolean
  pendingPick: SeasonPokemon | null
  picking: boolean
  onPick: (p: SeasonPokemon) => void
}

function PokemonRow({ p, canPick, pendingPick, picking, onPick }: PokemonRowProps) {
  const isSelected = pendingPick?.id === p.id
  const badge = p.is_mega ? TIER_DARK.Mega : (TIER_DARK[p.tier ?? ''] ?? TIER_DARK.Free)
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 border-b transition-colors"
      style={{
        borderColor: D.border,
        background: isSelected ? `${D.amber}18` : undefined,
      }}
    >
      <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
        {p.species_sprite_url ? (
          <img
            src={p.species_sprite_url}
            alt={p.species_name ?? ''}
            className="w-12 h-12 object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="w-10 h-10 rounded" style={{ background: D.border }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm capitalize" style={{ color: D.text }}>{p.species_name}</div>
        <div className="flex gap-1 mt-0.5 flex-wrap">
          {p.species_type1 && (
            <span className="rounded text-white" style={{ background: TYPE_COLORS[p.species_type1] ?? '#888', fontSize: 10, padding: '1px 5px' }}>{p.species_type1}</span>
          )}
          {p.species_type2 && (
            <span className="rounded text-white" style={{ background: TYPE_COLORS[p.species_type2] ?? '#888', fontSize: 10, padding: '1px 5px' }}>{p.species_type2}</span>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0 mr-1">
        <div className="font-bold font-display" style={{ color: D.amber, fontSize: '0.9rem', letterSpacing: '0.02em' }}>{p.point_cost ?? '?'}</div>
        <div className="font-display" style={{ color: D.muted, fontSize: 10, letterSpacing: '0.06em' }}>PTS</div>
      </div>
      {canPick && (
        <button
          onClick={() => onPick(p)}
          disabled={picking || isSelected}
          className="flex-shrink-0 rounded transition-colors disabled:opacity-50 font-display font-bold"
          style={{
            background: isSelected ? D.border : D.green,
            color: '#fff',
            letterSpacing: '0.1em',
            fontSize: '0.7rem',
            padding: '5px 10px',
          }}
        >
          {isSelected ? 'SELECTED' : 'DRAFT'}
        </button>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

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

  const currentRound = teams.length > 0 && draftState
    ? Math.ceil(draftState.current_pick_number / teams.length)
    : 1

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

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (draftState?.status === 'active' && draftState.timer_seconds && draftState.pick_started_at) {
      setTimeLeft(getTimeLeft(draftState))
      timerRef.current = setInterval(() => setTimeLeft(getTimeLeft(draftState)), 500)
    } else {
      setTimeLeft(null)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [draftState?.status, draftState?.current_pick_number, draftState?.pick_started_at])

  useEffect(() => {
    if (!seasonId) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/draft/ws/${seasonId}`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'pick') {
        if (msg.state) setDraftState(msg.state)
        if (msg.drafted_pokemon_id && msg.team_id != null)
          setPokemon(prev => prev.map(p => p.id === msg.drafted_pokemon_id ? { ...p, drafted_by_team_id: msg.team_id } : p))
        if (msg.team_id != null && msg.points_remaining != null)
          setTeams(prev => prev.map(t => t.id === msg.team_id ? { ...t, points_remaining: msg.points_remaining } : t))
        if (msg.pick) setPicks(prev => [...prev, msg.pick])
        setPendingPick(null)
      } else if (msg.type === 'state_change') {
        fetchState()
        setPendingPick(null)
      }
    }
    ws.onclose = () => setTimeout(() => fetchState(), 2000)
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
      setDraftState(data.state)
      setPokemon(prev => prev.map(p => p.id === data.drafted_pokemon_id ? { ...p, drafted_by_team_id: data.team_id } : p))
      setTeams(prev => prev.map(t => t.id === data.team_id ? { ...t, points_remaining: data.points_remaining } : t))
      setPicks(prev => [...prev, data.pick])
      setPendingPick(null)
      wsRef.current?.send(JSON.stringify({
        type: 'pick', state: data.state, drafted_pokemon_id: data.drafted_pokemon_id,
        team_id: data.team_id, points_remaining: data.points_remaining, pick: data.pick,
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
      setPendingPick(null); setPicks([])
      await fetchState()
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Reset failed') }
  }

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
  const tabAvailable = megaTab ? available.filter(p => p.is_mega) : available.filter(p => !p.is_mega)
  const regularTiers = TIERS.filter(t => t !== 'Mega')
  const filtered = tabAvailable.filter(p => {
    if (tierFilter && p.tier !== tierFilter) return false
    if (search && !p.species_name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const teamName = (id: number | null) => id ? (teams.find(t => t.id === id)?.name ?? `Team ${id}`) : '—'

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: D.bg }}>
        <div className="font-display font-bold tracking-widest" style={{ color: D.muted, letterSpacing: '0.15em' }}>
          LOADING DRAFT…
        </div>
      </div>
    )
  }

  // ── Not set up ───────────────────────────────────────────────────────────
  if (!draftState) {
    return (
      <div className="min-h-screen p-6" style={{ background: D.bg, color: D.text }}>
        <h1 className="font-display font-bold text-2xl mb-6" style={{ letterSpacing: '0.1em' }}>DRAFT ROOM</h1>
        <div className="rounded-xl border p-6 max-w-2xl" style={{ borderColor: D.border, background: D.surface }}>
          <p className="font-display font-bold text-lg mb-1" style={{ letterSpacing: '0.06em' }}>DRAFT HAS NOT BEEN SET UP YET</p>
          <p className="text-sm mb-5" style={{ color: D.muted }}>Before the draft can begin, an admin must complete these steps:</p>
          <ol className="space-y-3 mb-5 text-sm" style={{ color: D.muted }}>
            {[
              'Import all Pokemon and apply a regulation preset (Admin → Pokemon table)',
              'Assign every legal Pokemon to a tier — drag-and-drop or CSV upload (Admin → Tier List)',
              'Lock tiers once assignments are complete (Admin → Pokemon table → Lock Tiers)',
              'Ensure at least one team is registered for this season (Admin → Seasons)',
              'Set the draft order (Admin → Draft Order) — this creates the draft room',
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-display font-bold flex-shrink-0" style={{ color: D.amber }}>{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm" style={{ color: D.muted }}>Contact your league admin to get this set up.</p>
        </div>
      </div>
    )
  }

  // ── Draft room ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: D.bg, color: D.text }}>

      {/* ── Scoreboard header ── */}
      <div className="flex items-center justify-between gap-4 px-4 py-3" style={{ background: D.surface, borderBottom: `1px solid ${D.border}` }}>
        <div className="flex items-center gap-3">
          <span className="font-display font-bold text-lg text-white" style={{ letterSpacing: '0.12em' }}>
            UPL DRAFT
          </span>
          <span className="text-xs rounded px-2 py-0.5 font-display font-bold" style={{
            background: draftState.status === 'active' ? `${D.green}30` : draftState.status === 'paused' ? `${D.amber}20` : draftState.status === 'complete' ? `${D.green}20` : `${D.muted}20`,
            color: draftState.status === 'active' ? D.green : draftState.status === 'paused' ? D.amber : draftState.status === 'complete' ? D.green : D.muted,
            letterSpacing: '0.1em',
          }}>
            {draftState.status.toUpperCase()}
          </span>
        </div>

        {draftState.status !== 'pending' && (
          <div className="font-display font-bold text-sm" style={{ color: D.amber, letterSpacing: '0.1em' }}>
            ROUND {currentRound} &nbsp;·&nbsp; PICK {draftState.current_pick_number}
          </div>
        )}

        <div className="flex items-center gap-3">
          {timeLeft !== null && (
            <div className="font-display font-bold text-2xl tabular-nums" style={{
              color: timeLeft < 30 ? D.red : timeLeft < 60 ? D.amber : D.text,
              letterSpacing: '0.05em',
              minWidth: '4rem',
              textAlign: 'right',
              textShadow: timeLeft < 30 ? `0 0 12px ${D.red}80` : undefined,
            }}>
              {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
            </div>
          )}
          {isAdmin && draftState.status !== 'complete' && draftState.status !== 'pending' && (
            <button onClick={pauseResume} className="text-xs px-3 py-1.5 rounded border font-display font-bold transition-colors hover:opacity-80" style={{ borderColor: D.border, color: D.muted, background: 'transparent', letterSpacing: '0.08em' }}>
              {draftState.status === 'active' ? 'PAUSE' : 'RESUME'}
            </button>
          )}
          {isAdmin && (
            <button onClick={resetDraft} className="text-xs px-3 py-1.5 rounded border font-display font-bold transition-colors hover:opacity-80" style={{ borderColor: D.red, color: D.red, background: 'transparent', letterSpacing: '0.08em' }}>
              RESET
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">

        {/* ── Waiting to start ── */}
        {draftState.status === 'pending' && (
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl border-l-4" style={{ background: `${D.amber}10`, borderColor: D.amber, borderStyle: 'solid', borderWidth: '1px', borderLeftWidth: '4px' }}>
            <div>
              <div className="font-display font-bold mb-1" style={{ color: D.amber, letterSpacing: '0.1em' }}>
                DRAFT ROOM — WAITING TO START
              </div>
              <div className="text-sm" style={{ color: D.muted }}>
                All managers can see this page. When everyone is ready, click START DRAFT.
              </div>
            </div>
            {isAdmin ? (
              <button onClick={startDraft} className="flex-shrink-0 px-6 py-2 rounded font-display font-bold transition-colors hover:opacity-90" style={{ background: D.amber, color: '#000', letterSpacing: '0.1em' }}>
                START DRAFT
              </button>
            ) : (
              <span className="text-xs px-3 py-1.5 rounded border font-display" style={{ borderColor: D.border, color: D.muted, letterSpacing: '0.06em' }}>
                WAITING FOR ADMIN…
              </span>
            )}
          </div>
        )}

        {/* ── On the clock ── */}
        {draftState.status === 'active' && (
          <div
            className="flex items-center justify-between gap-4 p-3 rounded-xl border-l-4"
            style={{
              background: isMyTurn ? `${D.green}18` : `${D.amber}10`,
              borderColor: isMyTurn ? D.green : D.amber,
              borderStyle: 'solid',
              borderWidth: '1px',
              borderLeftWidth: '4px',
              boxShadow: isMyTurn ? `0 0 24px ${D.green}25` : undefined,
            }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-display font-bold text-xs" style={{ color: isMyTurn ? D.green : D.amber, letterSpacing: '0.14em' }}>
                ▶ ON THE CLOCK
              </span>
              <span className="font-display font-bold text-xl" style={{ color: D.text, letterSpacing: '0.02em' }}>
                {teamName(draftState.current_team_id)}
              </span>
              {isAdmin && pickingTeam && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: D.elevated, color: D.muted, border: `1px solid ${D.border}` }}>
                  picking as admin
                </span>
              )}
            </div>
            {isMyTurn && (
              <span className="font-display font-bold flex-shrink-0" style={{ color: D.green, letterSpacing: '0.1em', textShadow: `0 0 10px ${D.green}60` }}>
                ← YOUR PICK!
              </span>
            )}
          </div>
        )}

        {/* ── Paused ── */}
        {draftState.status === 'paused' && (
          <div className="p-3 rounded-xl border text-center font-display font-bold" style={{ background: `${D.muted}10`, borderColor: D.border, color: D.muted, letterSpacing: '0.1em' }}>
            ⏸ &nbsp; DRAFT PAUSED
          </div>
        )}

        {/* ── Complete ── */}
        {draftState.status === 'complete' && (
          <div className="p-3 rounded-xl border text-center font-display font-bold" style={{ background: `${D.green}12`, borderColor: D.green, color: D.green, letterSpacing: '0.1em' }}>
            ✓ &nbsp; DRAFT COMPLETE
          </div>
        )}

        {/* ── Pending pick confirmation ── */}
        {pendingPick && (
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl border-l-4" style={{ background: `${D.green}12`, borderColor: D.green, borderStyle: 'solid', borderWidth: '1px', borderLeftWidth: '4px' }}>
            <div className="flex items-center gap-3">
              {pendingPick.species_sprite_url && (
                <img src={pendingPick.species_sprite_url} alt={pendingPick.species_name ?? ''} className="w-16 h-16 object-contain flex-shrink-0" style={{ imageRendering: 'pixelated' }} />
              )}
              <div>
                <div className="font-display text-xs mb-1" style={{ color: D.muted, letterSpacing: '0.1em' }}>CONFIRM PICK?</div>
                <div className="font-display font-bold text-lg capitalize" style={{ color: D.text, letterSpacing: '0.04em' }}>
                  {pendingPick.species_name}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {pendingPick.tier && (
                    <span className="font-display font-bold text-xs px-2 py-0.5 rounded" style={{ background: (pendingPick.is_mega ? TIER_DARK.Mega : TIER_DARK[pendingPick.tier])?.bg ?? '#333', color: '#fff', letterSpacing: '0.06em' }}>
                      {pendingPick.is_mega ? 'MEGA' : pendingPick.tier}
                    </span>
                  )}
                  <span className="font-display font-bold" style={{ color: D.amber, letterSpacing: '0.04em' }}>
                    {pendingPick.point_cost ?? '?'} PTS
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={confirmPick}
                disabled={picking}
                className="px-5 py-2 rounded font-display font-bold disabled:opacity-50 transition-colors hover:opacity-90"
                style={{ background: D.green, color: '#fff', letterSpacing: '0.1em' }}
              >
                {picking ? 'DRAFTING…' : 'CONFIRM'}
              </button>
              <button
                onClick={() => setPendingPick(null)}
                className="px-4 py-2 rounded border font-display font-bold transition-colors hover:opacity-70"
                style={{ borderColor: D.border, color: D.muted, background: 'transparent', letterSpacing: '0.08em' }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {msg && <p className="text-sm" style={{ color: D.red }}>{msg}</p>}

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Available Pokemon — 2/3 */}
          <div className="lg:col-span-2 flex flex-col gap-3">

            {/* Regular / Mega tabs */}
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: D.border }}>
              <button
                onClick={() => { setMegaTab(false); setTierFilter('') }}
                className="flex-1 py-2 font-display font-bold transition-colors"
                style={{
                  background: !megaTab ? D.amber : D.surface,
                  color: !megaTab ? '#000' : D.muted,
                  letterSpacing: '0.1em',
                  fontSize: '0.8rem',
                }}
              >
                REGULAR ({available.filter(p => !p.is_mega).length})
              </button>
              <button
                onClick={() => { setMegaTab(true); setTierFilter('') }}
                className="flex-1 py-2 font-display font-bold transition-colors"
                style={{
                  background: megaTab ? TIER_DARK.Mega.bg : D.surface,
                  color: megaTab ? '#fff' : D.muted,
                  letterSpacing: '0.1em',
                  fontSize: '0.8rem',
                }}
              >
                MEGA ({available.filter(p => p.is_mega).length})
              </button>
            </div>

            {/* Search + tier filter */}
            <div className="flex gap-2">
              <input
                placeholder="Search Pokemon…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 rounded px-3 py-2 text-sm border outline-none"
                style={{ background: D.surface, borderColor: D.border, color: D.text }}
                onFocus={e => (e.target.style.borderColor = D.amber)}
                onBlur={e => (e.target.style.borderColor = D.border)}
              />
              {!megaTab && (
                <select
                  value={tierFilter}
                  onChange={e => setTierFilter(e.target.value)}
                  className="rounded px-2 py-2 text-sm border"
                  style={{ background: D.surface, borderColor: D.border, color: D.text }}
                >
                  <option value="">All Tiers</option>
                  {regularTiers.map(t => <option key={t}>{t}</option>)}
                </select>
              )}
            </div>

            <div className="font-display text-xs" style={{ color: D.muted, letterSpacing: '0.08em' }}>
              {filtered.length} AVAILABLE
            </div>

            {/* Pokemon list */}
            <div className="rounded-xl border overflow-hidden overflow-y-auto" style={{ borderColor: D.border, background: D.surface, maxHeight: '60vh' }}>
              {regularTiers.map(tier => {
                const tierPokemon = filtered.filter(p => p.tier === tier)
                if (tierPokemon.length === 0) return null
                const badge = TIER_DARK[tier] ?? TIER_DARK.Free
                return (
                  <div key={tier}>
                    <div className="sticky top-0 flex items-center gap-2 px-3 py-1.5" style={{ background: D.elevated, borderBottom: `1px solid ${D.border}` }}>
                      <span className="font-display font-bold text-xs px-2 py-0.5 rounded" style={{ background: badge.bg, color: badge.color, letterSpacing: '0.08em' }}>
                        {tier}
                      </span>
                      <span className="font-display text-xs" style={{ color: D.muted }}>
                        {tierPokemon.length} left
                      </span>
                    </div>
                    {tierPokemon.map(p => (
                      <PokemonRow key={p.id} p={p} canPick={!!canPick} pendingPick={pendingPick} picking={picking} onPick={setPendingPick} />
                    ))}
                  </div>
                )
              })}

              {/* Mega tab — flat list */}
              {megaTab && filtered.map(p => (
                <PokemonRow key={p.id} p={p} canPick={!!canPick} pendingPick={pendingPick} picking={picking} onPick={setPendingPick} />
              ))}

              {/* Untiered */}
              {!megaTab && filtered.filter(p => !p.tier).length > 0 && (
                <div>
                  <div className="sticky top-0 px-3 py-1.5" style={{ background: D.elevated, borderBottom: `1px solid ${D.border}` }}>
                    <span className="font-display text-xs" style={{ color: D.muted, letterSpacing: '0.08em' }}>UNTIERED</span>
                  </div>
                  {filtered.filter(p => !p.tier).map(p => (
                    <PokemonRow key={p.id} p={p} canPick={!!canPick} pendingPick={pendingPick} picking={picking} onPick={setPendingPick} />
                  ))}
                </div>
              )}

              {filtered.length === 0 && (
                <div className="p-8 text-center font-display" style={{ color: D.muted, letterSpacing: '0.08em' }}>
                  NO POKEMON MATCH YOUR FILTER
                </div>
              )}
            </div>
          </div>

          {/* Teams panel — 1/3 */}
          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '70vh' }}>
            {teams.map(team => {
              const isCurrentPick = team.id === draftState.current_team_id && draftState.status === 'active'
              const isNextPick = team.id === nextTeamId && team.id !== draftState.current_team_id
              const budgetPct = Math.max(0, Math.min(100, (team.points_remaining / 900) * 100))
              const { slots, free } = assignSlots(team.id)

              return (
                <div
                  key={team.id}
                  className="rounded-xl overflow-hidden border"
                  style={{
                    borderColor: isCurrentPick ? D.amber : D.border,
                    background: D.surface,
                    boxShadow: isCurrentPick ? `0 0 0 1px ${D.amber}40, 0 0 20px ${D.amber}15` : undefined,
                  }}
                >
                  {isCurrentPick && (
                    <div className="text-center py-0.5 font-display font-bold text-xs tracking-widest" style={{ background: D.amber, color: '#000' }}>
                      ON THE CLOCK
                    </div>
                  )}
                  {isNextPick && (
                    <div className="text-center py-0.5 font-display font-bold text-xs tracking-widest" style={{ background: '#78350f', color: D.amber }}>
                      NEXT PICK
                    </div>
                  )}

                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-sm" style={{ color: D.text }}>{team.name}</div>
                      <div className="font-display font-bold text-xs" style={{ color: D.amber, letterSpacing: '0.04em' }}>
                        {team.points_remaining} PTS
                      </div>
                    </div>

                    {/* Budget bar */}
                    <div className="h-1 rounded-full mb-3 overflow-hidden" style={{ background: D.border }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${budgetPct}%`,
                          background: budgetPct > 50 ? D.green : budgetPct > 25 ? D.amber : D.red,
                        }}
                      />
                    </div>

                    {/* Slot grid */}
                    <div className="flex gap-1 flex-wrap">
                      {SLOT_ORDER.map(slotKey => {
                        const p = slots[slotKey]
                        const badge = TIER_DARK[slotKey] ?? TIER_DARK.Free
                        const pickNum = p ? picks.find(pk => pk.season_pokemon_id === p.id)?.pick_number : undefined
                        return (
                          <div
                            key={slotKey}
                            className="relative flex-shrink-0 rounded"
                            style={{ width: 38, height: 46 }}
                            title={p ? `#${pickNum ?? '?'} ${p.species_name} · ${p.point_cost ?? '?'}pts` : `${slotKey} slot — empty`}
                          >
                            <div className="absolute inset-0 rounded border" style={{ borderColor: badge.bg, background: p ? `${badge.bg}20` : `${badge.bg}08`, opacity: p ? 1 : 0.55 }} />
                            {p ? (
                              <>
                                <img src={p.species_sprite_url ?? ''} alt={p.species_name ?? ''} className="w-full h-8 object-contain pt-0.5" style={{ imageRendering: 'pixelated' }} />
                                {pickNum !== undefined && (
                                  <span className="absolute top-0 left-0 font-bold leading-none px-0.5 rounded-br" style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 7 }}>{pickNum}</span>
                                )}
                              </>
                            ) : (
                              <div className="flex items-center justify-center h-8">
                                <span style={{ color: badge.bg, opacity: 0.4, fontSize: 8 }}>—</span>
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 text-center font-display font-bold rounded-b" style={{ background: badge.bg, color: badge.color, lineHeight: '11px', fontSize: 7, letterSpacing: '0.04em' }}>
                              {slotKey}
                            </div>
                          </div>
                        )
                      })}

                      {free.map((p, i) => {
                        const pickNum = p ? picks.find(pk => pk.season_pokemon_id === p.id)?.pick_number : undefined
                        const tBadge = p
                          ? (p.is_mega ? TIER_DARK.Mega : (TIER_DARK[p.tier ?? ''] ?? TIER_DARK.Free))
                          : { bg: D.border, color: D.muted }
                        return (
                          <div
                            key={`free-${i}`}
                            className="relative flex-shrink-0 rounded"
                            style={{ width: 38, height: 46 }}
                            title={p ? `#${pickNum ?? '?'} ${p.species_name} (free) · ${p.point_cost ?? '?'}pts` : 'Free slot'}
                          >
                            <div className="absolute inset-0 rounded border" style={{ borderColor: p ? tBadge.bg : D.border, background: p ? `${tBadge.bg}20` : `${D.border}08`, opacity: p ? 1 : 0.4 }} />
                            {p ? (
                              <>
                                <img src={p.species_sprite_url ?? ''} alt={p.species_name ?? ''} className="w-full h-8 object-contain pt-0.5" style={{ imageRendering: 'pixelated' }} />
                                {pickNum !== undefined && (
                                  <span className="absolute top-0 left-0 font-bold leading-none px-0.5 rounded-br" style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 7 }}>{pickNum}</span>
                                )}
                              </>
                            ) : (
                              <div className="flex items-center justify-center h-8">
                                <span style={{ color: D.muted, opacity: 0.35, fontSize: 8 }}>—</span>
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 text-center font-display font-bold rounded-b" style={{ background: p ? tBadge.bg : D.border, color: p ? tBadge.color : D.muted, lineHeight: '11px', fontSize: 7, letterSpacing: '0.04em' }}>
                              {p ? (p.tier ?? '?') : 'FREE'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

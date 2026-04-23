import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useActiveSeason } from '../hooks/useActiveSeason'
import { TIERS } from '../constants/tiers'

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
  const [picking, setPicking] = useState(false)
  const [msg, setMsg] = useState('')
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [pendingPick, setPendingPick] = useState<SeasonPokemon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isAdmin = user && (user.roles.includes('admin') || user.roles.includes('superadmin'))
  const myTeam = teams.find(t => t.manager_id === user?.id)
  const isMyTurn = draftState?.current_team_id === myTeam?.id
  const pickingTeam = teams.find(t => t.id === draftState?.current_team_id)

  const canPick = draftState?.status === 'active' && (isMyTurn || isAdmin)

  const fetchState = useCallback(async () => {
    if (!seasonId) return
    const [stateRes, pokemonRes, teamsRes] = await Promise.all([
      axios.get(`/draft/${seasonId}/state`).catch(() => null),
      axios.get(`/seasons/${seasonId}/pokemon`),
      axios.get(`/seasons/${seasonId}/teams`),
    ])
    if (stateRes) setDraftState(stateRes.data)
    setPokemon(pokemonRes.data)
    setTeams(teamsRes.data)
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
      await fetchState()
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Reset failed') }
  }

  const available = pokemon.filter(p => p.is_legal && !p.drafted_by_team_id)
  const filtered = available.filter(p => {
    if (tierFilter && p.tier !== tierFilter) return false
    if (search && !p.species_name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const teamName = (id: number | null) => id ? (teams.find(t => t.id === id)?.name ?? `Team ${id}`) : '—'
  const teamPokemon = (teamId: number) => pokemon.filter(p => p.drafted_by_team_id === teamId)

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading draft...</div>

  if (!draftState) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Draft Room</h1>
        <div className="p-8 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <p className="text-lg font-semibold mb-4">Draft has not started yet.</p>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>Before the draft can begin, an admin must complete these steps:</p>
          <ol className="space-y-2 mb-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--color-primary)' }}>1.</span> Import all Pokemon and apply a regulation preset (Admin → Pokemon table)</li>
            <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--color-primary)' }}>2.</span> Assign every legal Pokemon to a tier — either via drag-and-drop or CSV upload (Admin → Tier List)</li>
            <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--color-primary)' }}>3.</span> Lock tiers once assignments are complete (Admin → Pokemon table → Lock Tiers)</li>
            <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--color-primary)' }}>4.</span> Ensure at least one team is registered for this season (Admin → Seasons)</li>
            <li className="flex gap-2"><span className="font-bold" style={{ color: 'var(--color-primary)' }}>5.</span> Click Start Draft below</li>
          </ol>
          {isAdmin && (
            <button onClick={startDraft} className="px-6 py-2 rounded text-white font-semibold" style={{ background: 'var(--color-primary)' }}>
              Start Draft
            </button>
          )}
          {!isAdmin && (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Contact your league admin when you're ready to draft.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
          {isAdmin && draftState.status !== 'complete' && (
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
          <div className="flex gap-2 flex-wrap">
            <input
              placeholder="Search Pokemon..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 border rounded px-3 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            />
            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <option value="">All Tiers</option>
              {TIERS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{filtered.length} available</div>

          <div className="overflow-y-auto border rounded-lg" style={{ borderColor: 'var(--color-border)', maxHeight: '60vh' }}>
            {TIERS.map(tier => {
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
          {teams.map(team => (
            <div
              key={team.id}
              className="border rounded-lg p-3"
              style={{
                borderColor: team.id === draftState.current_team_id ? 'var(--color-primary)' : 'var(--color-border)',
                background: 'var(--color-surface)',
                boxShadow: team.id === draftState.current_team_id ? '0 0 0 2px var(--color-primary)33' : 'none',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm">{team.name}</div>
                <div className="text-xs font-mono" style={{ color: 'var(--color-primary)' }}>{team.points_remaining} pts</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {teamPokemon(team.id).map(p => {
                  const pickNum = picks.find(pk => pk.season_pokemon_id === p.id)?.pick_number
                  const tierColors: Record<string, string> = { S: '#f59e0b', A: '#8b5cf6', B: '#3b82f6', C: '#22c55e', D: '#ef4444', Mega: '#ec4899', Free: '#9ca3af' }
                  const tColor = tierColors[p.tier ?? ''] ?? '#9ca3af'
                  return (
                    <div
                      key={p.id}
                      className="relative"
                      style={{ width: 40, height: 44 }}
                      title={`#${pickNum ?? '?'} ${p.species_name} · ${p.tier ?? 'N/A'} · ${p.point_cost ?? '?'}pts`}
                    >
                      <img src={p.species_sprite_url ?? ''} alt={p.species_name ?? ''} className="w-10 h-8 object-contain" />
                      {pickNum !== undefined && (
                        <span className="absolute top-0 left-0 text-[7px] font-bold leading-none px-0.5 rounded-br"
                          style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}>
                          {pickNum}
                        </span>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 text-center text-[7px] font-bold rounded-b"
                        style={{ background: tColor, color: '#fff', lineHeight: '10px' }}>
                        {p.tier ?? '?'}
                      </div>
                    </div>
                  )
                })}
                {teamPokemon(team.id).length === 0 && (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No picks yet</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

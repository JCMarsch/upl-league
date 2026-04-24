import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RosterPokemon {
  id: number
  species_name: string | null
  species_sprite_url: string | null
  species_artwork_url: string | null
  species_type1: string | null
  species_type2: string | null
  tier: string | null
  point_cost: number | null
  draft_pick_number: number | null
  nickname: string | null
  ability: string | null
  item: string | null
  move1: string | null; move2: string | null; move3: string | null; move4: string | null
  tera_type: string | null
  season_pokemon_id: number
  hp: number | null; atk: number | null; def_: number | null
  spatk: number | null; spdef: number | null; spe: number | null; total: number | null
  gp: number; gw: number
  direct_kills: number; passive_kills: number; total_kills: number
  direct_deaths: number; passive_deaths: number; total_deaths: number
  kd_diff: number; games_brought: number; games_led: number
}

interface TeamDetail {
  id: number; name: string; abbreviation: string | null; logo_url: string | null
  primary_color: string; secondary_color: string; points_remaining: number
  manager_id: number; season_id: number; roster: RosterPokemon[]
  match_wins: number; match_losses: number; match_draws: number
  win_percentage: number; streak: number; game_differential: number
  total_kills: number; total_deaths: number; kd_differential: number
}

interface ScheduleItem {
  id: number; week_number: number; home_team_id: number; away_team_id: number; status: string
}

type RosterView = 'grid' | 'table'
type SortCol = 'name' | 'tier' | 'cost' | 'pick' | 'hp' | 'atk' | 'def' | 'spatk' | 'spdef' | 'spe' | 'total' | 'gp' | 'gw' | 'kills' | 'deaths' | 'kd' | 'brought' | 'led'

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Fire: '#EE8130', Water: '#6390F0', Grass: '#7AC74C', Electric: '#F7D02C',
  Ice: '#96D9D6', Fighting: '#C22E28', Poison: '#A33EA1', Ground: '#E2BF65',
  Flying: '#A98FF3', Psychic: '#F95587', Bug: '#A6B91A', Rock: '#B6A136',
  Ghost: '#735797', Dragon: '#6F35FC', Dark: '#705746', Steel: '#B7B7CE',
  Fairy: '#D685AD', Normal: '#A8A77A',
}

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  S: { bg: '#f59e0b', text: '#fff' },
  A: { bg: '#8b5cf6', text: '#fff' },
  B: { bg: '#3b82f6', text: '#fff' },
  C: { bg: '#22c55e', text: '#fff' },
  D: { bg: '#ef4444', text: '#fff' },
  Free: { bg: '#9ca3af', text: '#fff' },
}

const TYPE_CHART: Record<string, Record<string, number>> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fighting: 2, Poison: 0.5, Bug: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
}
const ALL_TYPES = Object.keys(TYPE_COLORS)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcWeaknesses(roster: RosterPokemon[]) {
  const totals: Record<string, number> = {}
  for (const type of ALL_TYPES) totals[type] = 0
  for (const p of roster) {
    for (const atk of ALL_TYPES) {
      let mult = 1
      if (p.species_type1) mult *= TYPE_CHART[atk]?.[p.species_type1] ?? 1
      if (p.species_type2) mult *= TYPE_CHART[atk]?.[p.species_type2] ?? 1
      if (mult > 1) totals[atk]++
      else if (mult === 0) totals[atk]--
    }
  }
  return totals
}

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0
}

function kdStr(v: number) {
  return v > 0 ? `+${v}` : `${v}`
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null
  const c = TIER_COLORS[tier] ?? { bg: '#9ca3af', text: '#fff' }
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: c.bg, color: c.text }}>
      {tier}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded text-white font-medium" style={{ background: TYPE_COLORS[type] ?? '#888' }}>
      {type}
    </span>
  )
}

function StatBar({ val, max = 255 }: { val: number | null; max?: number }) {
  if (val === null) return <span className="text-gray-300 text-xs">—</span>
  const pct = Math.min(100, Math.round((val / max) * 100))
  const color = val >= 120 ? '#22c55e' : val >= 80 ? '#eab308' : '#ef4444'
  return (
    <div className="flex items-center gap-1.5" style={{ minWidth: 72 }}>
      <span className="w-7 text-right text-xs tabular-nums">{val}</span>
      <div className="flex-1 h-1.5 rounded bg-gray-200 overflow-hidden">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function RadarChart({ roster }: { roster: RosterPokemon[] }) {
  const withStats = roster.filter(p => p.hp)
  if (withStats.length === 0) return null
  const avg = (key: keyof RosterPokemon) => {
    const vals = withStats.map(p => (p[key] as number) ?? 0)
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }
  const stats = [
    { label: 'HP', value: avg('hp') },
    { label: 'Atk', value: avg('atk') },
    { label: 'Def', value: avg('def_') },
    { label: 'SpA', value: avg('spatk') },
    { label: 'SpD', value: avg('spdef') },
    { label: 'Spe', value: avg('spe') },
  ]
  const size = 200; const cx = 100; const cy = 100; const r = 72; const n = 6
  const pts = stats.map((s, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    const frac = Math.min(s.value / 180, 1)
    return {
      x: cx + r * frac * Math.cos(angle),
      y: cy + r * frac * Math.sin(angle),
      lx: cx + (r + 22) * Math.cos(angle),
      ly: cy + (r + 22) * Math.sin(angle),
      label: `${s.label}\n${s.value}`,
    }
  })
  const rings = [0.25, 0.5, 0.75, 1].map(f =>
    stats.map((_, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2
      return `${cx + r * f * Math.cos(a)},${cy + r * f * Math.sin(a)}`
    }).join(' ')
  )
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((g, i) => <polygon key={i} points={g} fill="none" stroke="var(--color-border)" strokeWidth="1" />)}
      {stats.map((_, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke="var(--color-border)" strokeWidth="1" />
      })}
      <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="var(--color-primary)" fillOpacity="0.25" stroke="var(--color-primary)" strokeWidth="2" />
      {pts.map((p, i) => (
        <text key={i} x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="var(--color-text-muted)">
          {stats[i].label} {stats[i].value}
        </text>
      ))}
    </svg>
  )
}

// ─── Pokemon detail modal ─────────────────────────────────────────────────────

function PokemonModal({ p, canEdit, onClose, onSave, primaryColor }: {
  p: RosterPokemon; canEdit: boolean; onClose: () => void
  onSave: (id: number, data: Partial<RosterPokemon>) => Promise<void>
  primaryColor: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<RosterPokemon>>({})
  const [saving, setSaving] = useState(false)

  const set = (k: keyof RosterPokemon) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(d => ({ ...d, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(p.id, draft)
    setSaving(false)
    setEditing(false)
    setDraft({})
  }

  const bringRate = pct(p.games_brought, p.gp)
  const leadRate = pct(p.games_led, p.games_brought)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="rounded-xl shadow-2xl w-full max-w-lg overflow-hidden" style={{ background: 'var(--color-bg)' }} onClick={e => e.stopPropagation()}>
        {/* Header strip */}
        <div className="p-4 flex items-center gap-4" style={{ background: primaryColor + '22', borderBottom: `2px solid ${primaryColor}` }}>
          {p.species_artwork_url
            ? <img src={p.species_artwork_url} alt={p.species_name ?? ''} className="w-20 h-20 object-contain" />
            : p.species_sprite_url
              ? <img src={p.species_sprite_url} alt={p.species_name ?? ''} className="w-16 h-16 object-contain" />
              : <div className="w-16 h-16 rounded-full bg-gray-200" />
          }
          <div className="flex-1">
            <div className="font-bold text-xl">{p.nickname || p.species_name}</div>
            {p.nickname && <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{p.species_name}</div>}
            <div className="flex gap-1 mt-1 flex-wrap">
              {p.species_type1 && <TypeBadge type={p.species_type1} />}
              {p.species_type2 && <TypeBadge type={p.species_type2} />}
            </div>
            <div className="flex gap-2 mt-1 items-center">
              <TierBadge tier={p.tier} />
              {p.point_cost != null && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{p.point_cost} pts</span>}
              {p.draft_pick_number != null && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Pick #{p.draft_pick_number}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Base stats */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>Base Stats</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {([['HP', p.hp], ['Attack', p.atk], ['Defense', p.def_], ['Sp. Atk', p.spatk], ['Sp. Def', p.spdef], ['Speed', p.spe]] as [string, number | null][]).map(([l, v]) => (
                <div key={l} className="flex items-center gap-2 text-xs">
                  <span className="w-14 text-right" style={{ color: 'var(--color-text-muted)' }}>{l}</span>
                  <StatBar val={v} />
                </div>
              ))}
            </div>
            {p.total && <p className="text-xs mt-1 text-right font-semibold">BST: {p.total}</p>}
          </div>

          {/* Game stats */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>Season Stats</p>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {[
                ['GP', p.gp], ['GW', p.gw],
                ['Kills', p.total_kills], ['Deaths', p.total_deaths],
                ['K/D', kdStr(p.kd_diff)], ['Brought', `${bringRate}%`],
                ['Led', `${leadRate}%`], ['DK', p.direct_kills],
              ].map(([l, v]) => (
                <div key={String(l)} className="rounded p-2" style={{ background: 'var(--color-surface)' }}>
                  <div className="text-lg font-bold" style={{ color: Number(v) > 0 && l === 'K/D' ? '#22c55e' : Number(v) < 0 && l === 'K/D' ? '#ef4444' : undefined }}>{v}</div>
                  <div style={{ color: 'var(--color-text-muted)' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Set details */}
          {canEdit ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Set</p>
                {!editing
                  ? <button onClick={() => setEditing(true)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)' }}>Edit</button>
                  : <div className="flex gap-2">
                      <button onClick={() => { setEditing(false); setDraft({}) }} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)' }}>Cancel</button>
                      <button onClick={handleSave} disabled={saving} className="text-xs px-2 py-1 rounded text-white" style={{ background: 'var(--color-primary)' }}>{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                }
              </div>
              {editing ? (
                <div className="grid grid-cols-2 gap-2">
                  {(['nickname', 'ability', 'item', 'tera_type', 'move1', 'move2', 'move3', 'move4'] as (keyof RosterPokemon)[]).map(f => (
                    <div key={f}>
                      <label className="block text-xs mb-0.5 capitalize" style={{ color: 'var(--color-text-muted)' }}>{String(f).replace('_', ' ')}</label>
                      <input
                        value={(draft[f] ?? p[f] ?? '') as string}
                        onChange={set(f)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {p.ability && <div><span style={{ color: 'var(--color-text-muted)' }}>Ability </span>{p.ability}</div>}
                  {p.item && <div><span style={{ color: 'var(--color-text-muted)' }}>Item </span>{p.item}</div>}
                  {p.tera_type && <div><span style={{ color: 'var(--color-text-muted)' }}>Tera </span>{p.tera_type}</div>}
                  {(p.move1 || p.move2 || p.move3 || p.move4) && (
                    <div className="col-span-2">
                      <span style={{ color: 'var(--color-text-muted)' }}>Moves </span>
                      {[p.move1, p.move2, p.move3, p.move4].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {!p.ability && !p.item && !p.move1 && (
                    <p className="col-span-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>No set recorded yet.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Public: no set details shown */
            null
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const { user } = useAuthStore()
  const [team, setTeam] = useState<TeamDetail | null>(null)
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [allTeams, setAllTeams] = useState<Record<number, { name: string }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [view, setView] = useState<RosterView>('grid')
  const [selectedPokemon, setSelectedPokemon] = useState<RosterPokemon | null>(null)
  const [sortCol, setSortCol] = useState<SortCol>('pick')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [tierFilter, setTierFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [msg, setMsg] = useState('')

  const isAdmin = user && (user.roles?.includes('admin') || user.roles?.includes('superadmin'))
  const isManager = user && team?.manager_id === user.id
  const canEdit = !!(isAdmin || isManager)

  const fetchTeam = () => {
    if (!teamId) return
    axios.get(`/teams/${teamId}`)
      .then(async r => {
        setTeam(r.data)
        const [schedRes, teamsRes] = await Promise.all([
          axios.get(`/seasons/${r.data.season_id}/schedule`).catch(() => ({ data: [] })),
          axios.get(`/seasons/${r.data.season_id}/teams`).catch(() => ({ data: [] })),
        ])
        setSchedule(schedRes.data.filter((s: ScheduleItem) => s.home_team_id === r.data.id || s.away_team_id === r.data.id))
        const m: Record<number, { name: string }> = {}
        for (const t of teamsRes.data) m[t.id] = t
        setAllTeams(m)
      })
      .catch(() => setError('Team not found'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchTeam() }, [teamId])

  const handleSave = async (rosterId: number, data: Partial<RosterPokemon>) => {
    if (!team) return
    try {
      await axios.patch(`/teams/${team.id}/pokemon/${rosterId}`, data, { withCredentials: true })
      setMsg('Saved')
      fetchTeam()
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Save failed')
    }
  }

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'name' ? 'asc' : 'desc') }
  }

  const sortedRoster = useMemo(() => {
    if (!team) return []
    let list = team.roster.filter(p => {
      if (tierFilter && p.tier !== tierFilter) return false
      if (typeFilter && p.species_type1 !== typeFilter && p.species_type2 !== typeFilter) return false
      return true
    })
    return [...list].sort((a, b) => {
      let av: string | number, bv: string | number
      switch (sortCol) {
        case 'name':   av = a.species_name ?? ''; bv = b.species_name ?? ''; break
        case 'tier':   av = a.tier ?? 'ZZZ'; bv = b.tier ?? 'ZZZ'; break
        case 'cost':   av = a.point_cost ?? -1; bv = b.point_cost ?? -1; break
        case 'pick':   av = a.draft_pick_number ?? 999; bv = b.draft_pick_number ?? 999; break
        case 'hp':     av = a.hp ?? -1; bv = b.hp ?? -1; break
        case 'atk':    av = a.atk ?? -1; bv = b.atk ?? -1; break
        case 'def':    av = a.def_ ?? -1; bv = b.def_ ?? -1; break
        case 'spatk':  av = a.spatk ?? -1; bv = b.spatk ?? -1; break
        case 'spdef':  av = a.spdef ?? -1; bv = b.spdef ?? -1; break
        case 'spe':    av = a.spe ?? -1; bv = b.spe ?? -1; break
        case 'total':  av = a.total ?? -1; bv = b.total ?? -1; break
        case 'gp':     av = a.gp; bv = b.gp; break
        case 'gw':     av = a.gw; bv = b.gw; break
        case 'kills':  av = a.total_kills; bv = b.total_kills; break
        case 'deaths': av = a.total_deaths; bv = b.total_deaths; break
        case 'kd':     av = a.kd_diff; bv = b.kd_diff; break
        case 'brought':av = pct(a.games_brought, a.gp); bv = pct(b.games_brought, b.gp); break
        case 'led':    av = pct(a.games_led, a.games_brought); bv = pct(b.games_led, b.games_brought); break
        default:       av = a.draft_pick_number ?? 999; bv = b.draft_pick_number ?? 999
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [team, tierFilter, typeFilter, sortCol, sortDir])

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
  if (error || !team) return <div className="p-8 text-center text-red-500">{error || 'Team not found'}</div>

  const weaknesses = calcWeaknesses(team.roster)
  const topWeak = ALL_TYPES.filter(t => weaknesses[t] >= 2).sort((a, b) => weaknesses[b] - weaknesses[a])
  const immunities = ALL_TYPES.filter(t => weaknesses[t] < 0)
  const tiers = [...new Set(team.roster.map(p => p.tier).filter(Boolean))] as string[]
  const types = [...new Set(team.roster.flatMap(p => [p.species_type1, p.species_type2]).filter(Boolean))] as string[]
  const upcomingMatches = schedule.filter(s => s.status === 'scheduled').slice(0, 3)
  const pastMatches = schedule.filter(s => ['completed', 'confirmed'].includes(s.status)).slice(-3)
  const teamName = (id: number) => allTeams[id]?.name ?? `Team ${id}`

  const SortTh = ({ col, label, title }: { col: SortCol; label: string; title?: string }) => (
    <th className="px-2 py-2 text-right text-xs cursor-pointer select-none hover:bg-gray-200 whitespace-nowrap"
      onClick={() => handleSort(col)} title={title}>
      {label}{sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${team.primary_color}` }}>
        <div className="p-5 flex items-center gap-5 flex-wrap" style={{ background: team.primary_color + '22' }}>
          {team.logo_url && <img src={team.logo_url} alt={team.name} className="w-20 h-20 object-contain rounded-lg flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold">{team.name}</h1>
            {team.abbreviation && <p className="font-mono text-sm" style={{ color: 'var(--color-text-muted)' }}>{team.abbreviation}</p>}
          </div>
          {/* Record */}
          <div className="flex gap-4 flex-wrap items-center">
            <div className="text-center">
              <div className="text-2xl font-bold">{team.match_wins}–{team.match_losses}{team.match_draws > 0 ? `–${team.match_draws}` : ''}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Record</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: team.game_differential >= 0 ? '#22c55e' : '#ef4444' }}>
                {team.game_differential >= 0 ? '+' : ''}{team.game_differential}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Game Diff</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{Math.round(team.win_percentage * 100)}%</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Win %</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold">{team.streak > 0 ? `W${team.streak}` : team.streak < 0 ? `L${Math.abs(team.streak)}` : '—'}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Streak</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{team.points_remaining}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Pts Left</div>
            </div>
          </div>
        </div>
      </div>

      {msg && <p className="text-sm" style={{ color: msg.includes('ail') ? '#ef4444' : '#22c55e' }}>{msg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Roster ── */}
        <div className="lg:col-span-2 space-y-3">
          {/* Controls bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <h2 className="text-xl font-semibold flex-shrink-0">Roster ({team.roster.length})</h2>
            <div className="flex-1" />
            {/* Filters */}
            <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
              className="border rounded px-2 py-1.5 text-xs" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <option value="">All Tiers</option>
              {tiers.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="border rounded px-2 py-1.5 text-xs" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <option value="">All Types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {/* View toggle */}
            <div className="flex rounded overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
              {(['grid', 'table'] as RosterView[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className="px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: view === v ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: view === v ? '#fff' : 'var(--color-text-muted)',
                  }}>
                  {v === 'grid' ? '⊞ Grid' : '☰ Table'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Grid view ── */}
          {view === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sortedRoster.map(p => {
                const tierC = TIER_COLORS[p.tier ?? ''] ?? { bg: '#9ca3af', text: '#fff' }
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPokemon(p)}
                    className="rounded-xl overflow-hidden border text-left hover:shadow-md transition-shadow"
                    style={{ borderColor: team.primary_color + '66', background: team.primary_color + '0d' }}
                  >
                    {/* Sprite area */}
                    <div className="flex justify-center pt-3 pb-1" style={{ background: team.primary_color + '18' }}>
                      {p.species_sprite_url
                        ? <img src={p.species_sprite_url} alt={p.species_name ?? ''} className="w-16 h-16 object-contain" />
                        : <div className="w-16 h-16 rounded-full bg-gray-200" />
                      }
                    </div>
                    {/* Info */}
                    <div className="px-3 pb-1 pt-1.5">
                      <p className="font-semibold text-sm truncate">{p.nickname || p.species_name}</p>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {p.species_type1 && <TypeBadge type={p.species_type1} />}
                        {p.species_type2 && <TypeBadge type={p.species_type2} />}
                      </div>
                      {/* Quick game stats */}
                      {p.gp > 0 && (
                        <div className="flex gap-2 mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          <span>{p.gp} GP</span>
                          <span style={{ color: p.kd_diff >= 0 ? '#22c55e' : '#ef4444' }}>{kdStr(p.kd_diff)} K/D</span>
                        </div>
                      )}
                    </div>
                    {/* Tier banner */}
                    <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: tierC.bg }}>
                      <span className="text-xs font-bold" style={{ color: tierC.text }}>
                        {p.tier ? `Tier ${p.tier}` : 'Untiered'}
                      </span>
                      {p.draft_pick_number != null && (
                        <span className="text-xs opacity-80" style={{ color: tierC.text }}>#{p.draft_pick_number}</span>
                      )}
                    </div>
                  </button>
                )
              })}
              {sortedRoster.length === 0 && (
                <p className="col-span-3 text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>No Pokemon match your filters.</p>
              )}
            </div>
          )}

          {/* ── Table view ── */}
          {view === 'table' && (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-xs border-collapse" style={{ minWidth: 780 }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface)' }}>
                    <th className="px-2 py-2 w-10 text-left">Spr</th>
                    <th className="px-2 py-2 text-left cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort('name')}>
                      Name{sortCol === 'name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th className="px-2 py-2 text-left">Types</th>
                    <SortTh col="tier" label="Tier" />
                    <SortTh col="cost" label="Cost" />
                    <SortTh col="pick" label="Pick" title="Draft pick number" />
                    <SortTh col="hp" label="HP" />
                    <SortTh col="atk" label="Atk" />
                    <SortTh col="def" label="Def" />
                    <SortTh col="spatk" label="SpA" />
                    <SortTh col="spdef" label="SpD" />
                    <SortTh col="spe" label="Spe" />
                    <SortTh col="total" label="BST" />
                    <SortTh col="gp" label="GP" />
                    <SortTh col="gw" label="GW" />
                    <SortTh col="kills" label="Kills" />
                    <SortTh col="deaths" label="Deaths" />
                    <SortTh col="kd" label="K/D" />
                    <SortTh col="brought" label="Bring%" title="Games brought / games played" />
                    <SortTh col="led" label="Lead%" title="Times led / games brought" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRoster.map(p => {
                    const tierC = TIER_COLORS[p.tier ?? ''] ?? { bg: '#9ca3af', text: '#fff' }
                    return (
                      <tr key={p.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedPokemon(p)}>
                        <td className="px-2 py-1">
                          {p.species_sprite_url
                            ? <img src={p.species_sprite_url} alt="" className="w-8 h-8 object-contain" />
                            : <div className="w-8 h-8 bg-gray-200 rounded" />}
                        </td>
                        <td className="px-2 py-1 font-medium whitespace-nowrap">
                          {p.nickname || p.species_name}
                          {p.nickname && <span className="ml-1 text-gray-400">({p.species_name})</span>}
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex gap-0.5">
                            {p.species_type1 && <TypeBadge type={p.species_type1} />}
                            {p.species_type2 && <TypeBadge type={p.species_type2} />}
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right">
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: tierC.bg, color: tierC.text }}>{p.tier ?? '—'}</span>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.point_cost ?? '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-gray-400">#{p.draft_pick_number ?? '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.hp ?? '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.atk ?? '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.def_ ?? '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.spatk ?? '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.spdef ?? '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.spe ?? '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums font-semibold">{p.total ?? '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.gp}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.gw}</td>
                        <td className="px-2 py-1 text-right tabular-nums font-semibold">{p.total_kills}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{p.total_deaths}</td>
                        <td className="px-2 py-1 text-right tabular-nums font-semibold"
                          style={{ color: p.kd_diff > 0 ? '#16a34a' : p.kd_diff < 0 ? '#dc2626' : undefined }}>
                          {kdStr(p.kd_diff)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{pct(p.games_brought, p.gp)}%</td>
                        <td className="px-2 py-1 text-right tabular-nums">{pct(p.games_led, p.games_brought)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {sortedRoster.length === 0 && (
                <p className="text-center text-sm py-8" style={{ color: 'var(--color-text-muted)' }}>No Pokemon match your filters.</p>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          {/* Type weaknesses */}
          {team.roster.length > 0 && (
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold text-sm mb-3">Type Weaknesses</h3>
              {topWeak.length === 0
                ? <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No major weaknesses</p>
                : topWeak.map(t => (
                    <div key={t} className="flex items-center justify-between mb-1">
                      <span className="text-xs px-2 py-0.5 rounded text-white" style={{ background: TYPE_COLORS[t] }}>{t}</span>
                      <span className="text-xs font-bold text-red-500">×{weaknesses[t]}</span>
                    </div>
                  ))
              }
              {immunities.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Immunities</p>
                  <div className="flex flex-wrap gap-1">
                    {immunities.map(t => (
                      <span key={t} className="text-xs px-1.5 py-0.5 rounded text-white opacity-70" style={{ background: TYPE_COLORS[t] }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Avg base stats radar */}
          {team.roster.length > 0 && (
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold text-sm mb-2">Avg Base Stats</h3>
              <div className="flex justify-center">
                <RadarChart roster={team.roster} />
              </div>
            </div>
          )}

          {/* Schedule */}
          {(upcomingMatches.length > 0 || pastMatches.length > 0) && (
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold text-sm mb-3">Schedule</h3>
              <div className="space-y-1.5">
                {pastMatches.map(s => {
                  const opp = s.home_team_id === team.id ? s.away_team_id : s.home_team_id
                  return (
                    <div key={s.id} className="flex justify-between text-xs">
                      <span style={{ color: 'var(--color-text-muted)' }}>Wk {s.week_number}</span>
                      <span>vs {teamName(opp)}</span>
                      <span className="text-green-600">✓</span>
                    </div>
                  )
                })}
                {upcomingMatches.map(s => {
                  const opp = s.home_team_id === team.id ? s.away_team_id : s.home_team_id
                  return (
                    <div key={s.id} className="flex justify-between text-xs">
                      <span style={{ color: 'var(--color-text-muted)' }}>Wk {s.week_number}</span>
                      <span>vs {teamName(opp)}</span>
                      <span style={{ color: '#f59e0b' }}>upcoming</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pokemon detail modal */}
      {selectedPokemon && (
        <PokemonModal
          p={selectedPokemon}
          canEdit={canEdit}
          primaryColor={team.primary_color}
          onClose={() => setSelectedPokemon(null)}
          onSave={async (id, data) => { await handleSave(id, data); setSelectedPokemon(null) }}
        />
      )}
    </div>
  )
}

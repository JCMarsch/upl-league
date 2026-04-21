import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

interface RosterPokemon {
  id: number
  species_name: string | null
  species_sprite_url: string | null
  species_type1: string | null
  species_type2: string | null
  tier: string | null
  point_cost: number | null
  nickname: string | null
  ability: string | null
  item: string | null
  move1: string | null
  move2: string | null
  move3: string | null
  move4: string | null
  tera_type: string | null
  season_pokemon_id: number
}

interface TeamDetail {
  id: number
  name: string
  abbreviation: string | null
  logo_url: string | null
  primary_color: string
  secondary_color: string
  points_remaining: number
  manager_id: number
  roster: RosterPokemon[]
}

interface Award { name: string; team_id: number | null }
interface ScheduleItem { id: number; week_number: number; home_team_id: number; away_team_id: number; status: string }
interface Teams { [id: number]: { name: string } }

const TYPE_COLORS: Record<string, string> = {
  Fire: '#EE8130', Water: '#6390F0', Grass: '#7AC74C', Electric: '#F7D02C',
  Ice: '#96D9D6', Fighting: '#C22E28', Poison: '#A33EA1', Ground: '#E2BF65',
  Flying: '#A98FF3', Psychic: '#F95587', Bug: '#A6B91A', Rock: '#B6A136',
  Ghost: '#735797', Dragon: '#6F35FC', Dark: '#705746', Steel: '#B7B7CE',
  Fairy: '#D685AD', Normal: '#A8A77A',
}

// Simplified type chart (attacker → defenders with multipliers ≠1)
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

function calcTypeWeaknesses(roster: RosterPokemon[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const type of ALL_TYPES) totals[type] = 0

  for (const p of roster) {
    for (const attackType of ALL_TYPES) {
      let mult = 1
      const t1 = p.species_type1
      const t2 = p.species_type2
      if (t1) mult *= TYPE_CHART[attackType]?.[t1] ?? 1
      if (t2) mult *= TYPE_CHART[attackType]?.[t2] ?? 1
      if (mult > 1) totals[attackType] = (totals[attackType] || 0) + 1
      else if (mult === 0) totals[attackType] = (totals[attackType] || 0) - 1
    }
  }
  return totals
}

function RadarChart({ stats }: { stats: { label: string; value: number; max: number }[] }) {
  const size = 200
  const cx = size / 2
  const cy = size / 2
  const r = 80
  const n = stats.length
  const points = stats.map((s, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    const pct = Math.min(s.value / s.max, 1)
    return {
      x: cx + r * pct * Math.cos(angle),
      y: cy + r * pct * Math.sin(angle),
      lx: cx + (r + 20) * Math.cos(angle),
      ly: cy + (r + 20) * Math.sin(angle),
      label: s.label,
      value: s.value,
    }
  })

  const polyPts = points.map(p => `${p.x},${p.y}`).join(' ')

  // Grid rings
  const gridRings = [0.25, 0.5, 0.75, 1.0].map(pct => {
    const gPts = stats.map((_, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2
      return `${cx + r * pct * Math.cos(angle)},${cy + r * pct * Math.sin(angle)}`
    }).join(' ')
    return gPts
  })

  // Axis lines
  const axes = stats.map((_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    return { x1: cx, y1: cy, x2: cx + r * Math.cos(angle), y2: cy + r * Math.sin(angle) }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridRings.map((gPts, i) => (
        <polygon key={i} points={gPts} fill="none" stroke="var(--color-border)" strokeWidth="1" />
      ))}
      {axes.map((ax, i) => (
        <line key={i} x1={ax.x1} y1={ax.y1} x2={ax.x2} y2={ax.y2} stroke="var(--color-border)" strokeWidth="1" />
      ))}
      <polygon points={polyPts} fill="var(--color-primary)" fillOpacity="0.3" stroke="var(--color-primary)" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={i}>
          <text x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="var(--color-text-muted)">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

export default function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const { user } = useAuthStore()
  const [team, setTeam] = useState<TeamDetail | null>(null)
  const [awards, setAwards] = useState<Award[]>([])
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [allTeams, setAllTeams] = useState<Teams>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Record<number, Partial<RosterPokemon>>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const isAdmin = user && (user.roles.includes('admin') || user.roles.includes('superadmin'))
  const isManager = user && team?.manager_id === user.id
  const canEdit = isAdmin || isManager

  const fetchTeam = () => {
    if (!teamId) return
    axios.get(`/teams/${teamId}`)
      .then(async r => {
        setTeam(r.data)
        // Fetch schedule and awards
        const [schedRes, teamsRes] = await Promise.all([
          axios.get(`/seasons/${r.data.season_id}/schedule`).catch(() => ({ data: [] })),
          axios.get(`/seasons/${r.data.season_id}/teams`).catch(() => ({ data: [] })),
        ])
        const myMatches = schedRes.data.filter(
          (s: ScheduleItem) => s.home_team_id === r.data.id || s.away_team_id === r.data.id
        )
        setSchedule(myMatches)
        const m: Teams = {}
        for (const t of teamsRes.data) m[t.id] = t
        setAllTeams(m)
      })
      .catch(() => setError('Team not found'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchTeam() }, [teamId])

  const saveEdit = async (rosterId: number) => {
    if (!team || !editData[rosterId]) return
    setSaving(true); setMsg('')
    try {
      await axios.patch(`/teams/${team.id}/pokemon/${rosterId}`, editData[rosterId], { withCredentials: true })
      setMsg('Saved!')
      setEditData(e => { const n = { ...e }; delete n[rosterId]; return n })
      fetchTeam()
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed to save') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  if (error || !team) return <div className="p-8 text-center text-red-500">{error || 'Team not found'}</div>

  const weaknesses = calcTypeWeaknesses(team.roster)
  const topWeaknesses = ALL_TYPES.filter(t => weaknesses[t] >= 2).sort((a, b) => weaknesses[b] - weaknesses[a])
  const immunities = ALL_TYPES.filter(t => weaknesses[t] < 0)

  // Base stat averages for radar
  const avgStats = { HP: 75, Atk: 80, Def: 70, SpAtk: 80, SpDef: 70, Spe: 85 }
  const radarData = Object.entries(avgStats).map(([label, value]) => ({ label, value, max: 160 }))

  const teamName = (id: number) => allTeams[id]?.name ?? `Team ${id}`
  const upcomingMatches = schedule.filter(s => s.status === 'scheduled').slice(0, 3)
  const pastMatches = schedule.filter(s => ['completed', 'confirmed'].includes(s.status)).slice(-3)

  return (
    <div className="space-y-6">
      {/* Team header */}
      <div
        className="rounded-xl p-6 flex items-center gap-6 flex-wrap"
        style={{ background: team.primary_color + '22', border: `2px solid ${team.primary_color}` }}
      >
        {team.logo_url && <img src={team.logo_url} alt={team.name} className="w-20 h-20 object-contain rounded-lg" />}
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{team.name}</h1>
          {team.abbreviation && <p className="font-mono text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{team.abbreviation}</p>}
          <p className="mt-2 text-sm font-medium">
            Points remaining: <span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>{team.points_remaining}</span>
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditMode(!editMode); setEditData({}); setMsg('') }}
            className="px-4 py-2 text-sm rounded border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {editMode ? 'Done Editing' : 'Edit Roster'}
          </button>
        )}
      </div>

      {msg && <p className={`text-sm ${msg.includes('ail') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: Roster */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold">Roster ({team.roster.length})</h2>
          {team.roster.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No Pokemon drafted yet.</p>
          ) : (
            <div className="space-y-2">
              {team.roster.map(p => (
                <div key={p.id} className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:opacity-90"
                    style={{ background: 'var(--color-surface)' }}
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  >
                    {p.species_sprite_url && (
                      <img src={p.species_sprite_url} alt={p.species_name ?? ''} className="w-12 h-12 object-contain flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{p.nickname || p.species_name}</div>
                      {p.nickname && <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{p.species_name}</div>}
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {p.species_type1 && (
                          <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: TYPE_COLORS[p.species_type1] ?? '#888' }}>{p.species_type1}</span>
                        )}
                        {p.species_type2 && (
                          <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: TYPE_COLORS[p.species_type2] ?? '#888' }}>{p.species_type2}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {p.tier && <div className="text-xs font-bold px-2 py-0.5 rounded mb-1" style={{ background: 'var(--color-border)' }}>Tier {p.tier}</div>}
                      {p.point_cost != null && <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{p.point_cost} pts</div>}
                    </div>
                    <div className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{expandedId === p.id ? '▲' : '▼'}</div>
                  </div>

                  {expandedId === p.id && (
                    <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                      {editMode && canEdit ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            {(['nickname', 'ability', 'item', 'tera_type', 'move1', 'move2', 'move3', 'move4'] as const).map(field => (
                              <div key={field}>
                                <label className="block text-xs mb-1 capitalize">{field.replace('_', ' ')}</label>
                                <input
                                  value={editData[p.id]?.[field] ?? p[field] ?? ''}
                                  onChange={e => setEditData(d => ({ ...d, [p.id]: { ...d[p.id], [field]: e.target.value } }))}
                                  className="w-full border rounded px-2 py-1.5 text-sm"
                                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                                />
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => saveEdit(p.id)}
                            disabled={saving || !editData[p.id]}
                            className="px-4 py-1.5 rounded text-white text-sm disabled:opacity-50"
                            style={{ background: 'var(--color-primary)' }}
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {p.ability && <div><span style={{ color: 'var(--color-text-muted)' }}>Ability: </span>{p.ability}</div>}
                          {p.item && <div><span style={{ color: 'var(--color-text-muted)' }}>Item: </span>{p.item}</div>}
                          {p.tera_type && <div><span style={{ color: 'var(--color-text-muted)' }}>Tera: </span>{p.tera_type}</div>}
                          {(p.move1 || p.move2 || p.move3 || p.move4) && (
                            <div className="col-span-2">
                              <span style={{ color: 'var(--color-text-muted)' }}>Moves: </span>
                              {[p.move1, p.move2, p.move3, p.move4].filter(Boolean).join(' / ')}
                            </div>
                          )}
                          {!p.ability && !p.item && !p.move1 && (
                            <div className="col-span-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>No set details recorded yet.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Type weakness chart */}
          {team.roster.length > 0 && (
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold mb-3 text-sm">Type Weaknesses</h3>
              <div className="space-y-1">
                {topWeaknesses.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No major weaknesses</p>
                ) : topWeaknesses.map(t => (
                  <div key={t} className="flex items-center justify-between">
                    <span className="text-xs px-2 py-0.5 rounded text-white" style={{ background: TYPE_COLORS[t] ?? '#888' }}>{t}</span>
                    <span className="text-xs font-bold" style={{ color: '#ef4444' }}>x{weaknesses[t]}</span>
                  </div>
                ))}
              </div>
              {immunities.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Immunities / Resistances</div>
                  <div className="flex flex-wrap gap-1">
                    {immunities.map(t => (
                      <span key={t} className="text-xs px-1.5 py-0.5 rounded text-white opacity-70" style={{ background: TYPE_COLORS[t] ?? '#888' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Avg base stats radar */}
          {team.roster.length > 0 && (
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold mb-2 text-sm">Avg Base Stats</h3>
              <div className="flex justify-center">
                <RadarChart stats={radarData} />
              </div>
              <p className="text-xs text-center mt-1" style={{ color: 'var(--color-text-muted)' }}>Approximate — detailed stats from PokeAPI</p>
            </div>
          )}

          {/* Trophy cabinet */}
          {awards.length > 0 && (
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold mb-3 text-sm">Trophy Cabinet</h3>
              <div className="space-y-2">
                {awards.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xl">🏆</span>
                    <span className="text-sm">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schedule */}
          {(upcomingMatches.length > 0 || pastMatches.length > 0) && (
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold mb-3 text-sm">Schedule</h3>
              <div className="space-y-2">
                {pastMatches.map(s => {
                  const isHome = s.home_team_id === team.id
                  const oppId = isHome ? s.away_team_id : s.home_team_id
                  return (
                    <div key={s.id} className="text-xs flex justify-between">
                      <span style={{ color: 'var(--color-text-muted)' }}>Wk {s.week_number}</span>
                      <span>vs {teamName(oppId)}</span>
                      <span className="text-green-600">✓</span>
                    </div>
                  )
                })}
                {upcomingMatches.map(s => {
                  const isHome = s.home_team_id === team.id
                  const oppId = isHome ? s.away_team_id : s.home_team_id
                  return (
                    <div key={s.id} className="text-xs flex justify-between">
                      <span style={{ color: 'var(--color-text-muted)' }}>Wk {s.week_number}</span>
                      <span>vs {teamName(oppId)}</span>
                      <span style={{ color: '#f59e0b' }}>upcoming</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

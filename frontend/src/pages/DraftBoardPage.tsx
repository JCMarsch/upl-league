import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { useActiveSeason } from '../hooks/useActiveSeason'

interface DraftPick {
  pick_number: number
  team_id: number
  team_name: string
  team_abbreviation: string | null
  team_primary_color: string
  team_secondary_color: string
  tier: string | null
  point_cost: number | null
  species_id: number
  species_name: string | null
  species_sprite_url: string | null
  species_type1: string | null
  species_type2: string | null
}

type ViewMode = 'grid' | 'teams'

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#8b5cf6', B: '#3b82f6', C: '#22c55e', D: '#ef4444', Free: '#6b7280',
}

const TYPE_COLORS: Record<string, string> = {
  Normal: '#A8A878', Fire: '#F08030', Water: '#6890F0', Electric: '#F8D030',
  Grass: '#78C850', Ice: '#98D8D8', Fighting: '#C03028', Poison: '#A040A0',
  Ground: '#E0C068', Flying: '#A890F0', Psychic: '#F85888', Bug: '#A8B820',
  Rock: '#B8A038', Ghost: '#705898', Dragon: '#7038F8', Dark: '#705848',
  Steel: '#B8B8D0', Fairy: '#EE99AC',
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-white rounded px-1 py-0.5"
      style={{ background: TYPE_COLORS[type] ?? '#888', fontSize: '0.6rem', fontWeight: 600 }}>
      {type}
    </span>
  )
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null
  return (
    <span className="text-white rounded px-1.5 py-0.5 font-bold"
      style={{ background: TIER_COLORS[tier] ?? '#888', fontSize: '0.65rem' }}>
      {tier}
    </span>
  )
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

function PickTooltip({ pick }: { pick: DraftPick }) {
  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-40 rounded-lg shadow-xl p-2 text-xs pointer-events-none"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="font-semibold mb-0.5">{pick.species_name}</div>
      <div className="flex gap-1 mb-1">
        {pick.species_type1 && <TypeBadge type={pick.species_type1} />}
        {pick.species_type2 && <TypeBadge type={pick.species_type2} />}
      </div>
      <div className="flex justify-between">
        <span style={{ color: 'var(--color-text-muted)' }}>Tier</span>
        <TierBadge tier={pick.tier} />
      </div>
      {pick.point_cost != null && (
        <div className="flex justify-between">
          <span style={{ color: 'var(--color-text-muted)' }}>Cost</span>
          <span>{pick.point_cost}pts</span>
        </div>
      )}
      <div className="flex justify-between">
        <span style={{ color: 'var(--color-text-muted)' }}>Pick</span>
        <span>#{pick.pick_number}</span>
      </div>
    </div>
  )
}

// ── PickCell ─────────────────────────────────────────────────────────────────

function PickCell({ pick }: { pick: DraftPick }) {
  const [hover, setHover] = useState(false)
  const tierColor = TIER_COLORS[pick.tier ?? ''] ?? '#6b7280'

  return (
    <div
      className="relative flex flex-col items-center rounded-lg overflow-hidden cursor-default select-none"
      style={{
        background: pick.team_primary_color + '18',
        border: `1px solid ${pick.team_primary_color}44`,
        width: 72,
        minWidth: 72,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && <PickTooltip pick={pick} />}
      {/* Sprite */}
      <div className="pt-1 px-1 flex-1 flex items-center justify-center" style={{ minHeight: 48 }}>
        {pick.species_sprite_url ? (
          <img src={pick.species_sprite_url} alt={pick.species_name ?? ''} style={{ width: 48, height: 48 }} />
        ) : (
          <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="text-xs text-center" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
              {(pick.species_name ?? '').substring(0, 6)}
            </span>
          </div>
        )}
      </div>
      {/* Name */}
      <div className="px-1 pb-0.5 text-center" style={{ fontSize: '0.58rem', color: 'var(--color-text-muted)', lineHeight: 1.2 }}>
        {(pick.species_name ?? '').length > 9
          ? (pick.species_name ?? '').substring(0, 8) + '…'
          : pick.species_name}
      </div>
      {/* Tier strip */}
      <div className="w-full flex items-center justify-between px-1 py-0.5"
        style={{ background: tierColor, fontSize: '0.58rem', color: '#fff' }}>
        <span className="font-bold">{pick.tier ?? '?'}</span>
        <span className="opacity-75">#{pick.pick_number}</span>
      </div>
    </div>
  )
}

// ── Grid View ─────────────────────────────────────────────────────────────────

function GridView({ picks, teams }: { picks: DraftPick[]; teams: string[] }) {
  if (picks.length === 0) return null

  const teamIds = Array.from(new Set(picks.map(p => String(p.team_id))))
  const numTeams = teamIds.length

  // Build round × team grid
  const roundsNeeded = Math.ceil(picks.length / numTeams)

  // Map team_id → column index (in draft order from round 1)
  const round1Picks = picks.filter(p => p.pick_number <= numTeams)
  const teamOrder = round1Picks.sort((a, b) => a.pick_number - b.pick_number).map(p => String(p.team_id))
  // Add any teams not in round 1
  for (const id of teamIds) {
    if (!teamOrder.includes(id)) teamOrder.push(id)
  }

  const teamColMap: Record<string, number> = {}
  teamOrder.forEach((id, i) => { teamColMap[id] = i })

  const grid: (DraftPick | null)[][] = Array.from({ length: roundsNeeded }, () =>
    Array(teamOrder.length).fill(null)
  )
  for (const pick of picks) {
    const round = Math.ceil(pick.pick_number / numTeams) - 1
    const col = teamColMap[String(pick.team_id)]
    if (round >= 0 && round < roundsNeeded && col !== undefined) {
      grid[round][col] = pick
    }
  }

  const teamMap: Record<string, DraftPick> = {}
  for (const p of picks) teamMap[String(p.team_id)] = p

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
        <thead>
          <tr>
            <th style={{ width: 60, color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 500, textAlign: 'right', paddingRight: 8 }}>Round</th>
            {teamOrder.map(tid => {
              const p = teamMap[tid]
              return (
                <th key={tid} style={{ width: 76, textAlign: 'center', paddingBottom: 6 }}>
                  <div className="text-xs font-semibold truncate" style={{ color: p?.team_primary_color ?? 'var(--color-text)', maxWidth: 76 }}>
                    {p?.team_abbreviation ?? p?.team_name ?? `T${tid}`}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, rIdx) => {
            const isSnakeLeft = rIdx % 2 === 1
            return (
              <tr key={rIdx}>
                <td style={{ textAlign: 'right', paddingRight: 8, verticalAlign: 'middle' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                    R{rIdx + 1} {isSnakeLeft ? '←' : '→'}
                  </span>
                </td>
                {row.map((pick, cIdx) => (
                  <td key={cIdx} style={{ verticalAlign: 'top', padding: 0 }}>
                    {pick ? <PickCell pick={pick} /> : (
                      <div style={{
                        width: 72, height: 80, borderRadius: 8,
                        border: '1px dashed var(--color-border)',
                        opacity: 0.3,
                      }} />
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Teams View ────────────────────────────────────────────────────────────────

function TeamsView({ picks }: { picks: DraftPick[] }) {
  const teamIds = Array.from(new Set(picks.map(p => p.team_id)))

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {teamIds.map(teamId => {
        const teamPicks = picks.filter(p => p.team_id === teamId)
        if (teamPicks.length === 0) return null
        const first = teamPicks[0]
        const tiers = Array.from(new Set(teamPicks.map(p => p.tier ?? 'Free'))).sort((a, b) => {
          const order = ['S', 'A', 'B', 'C', 'D', 'Free']
          return order.indexOf(a) - order.indexOf(b)
        })

        return (
          <div key={teamId} className="rounded-xl border overflow-hidden"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            <div className="px-4 py-3 flex items-center gap-2"
              style={{ background: first.team_primary_color + '22', borderBottom: '1px solid var(--color-border)' }}>
              <span className="font-bold text-sm" style={{ color: first.team_primary_color }}>
                {first.team_name}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {teamPicks.length} picks
              </span>
            </div>
            <div className="p-3 space-y-3">
              {tiers.map(tier => {
                const tierPicks = teamPicks.filter(p => (p.tier ?? 'Free') === tier)
                const tierColor = TIER_COLORS[tier] ?? '#6b7280'
                return (
                  <div key={tier}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-bold text-white px-2 py-0.5 rounded"
                        style={{ background: tierColor }}>
                        {tier}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {tierPicks.sort((a, b) => (a.pick_number ?? 0) - (b.pick_number ?? 0)).map(pick => (
                        <div key={pick.pick_number} className="group relative flex items-center gap-1.5 rounded-lg px-2 py-1"
                          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                          {pick.species_sprite_url && (
                            <img src={pick.species_sprite_url} alt={pick.species_name ?? ''} style={{ width: 32, height: 32 }} />
                          )}
                          <div>
                            <div className="text-xs font-medium">{pick.species_name}</div>
                            <div className="flex gap-0.5 mt-0.5">
                              {pick.species_type1 && <TypeBadge type={pick.species_type1} />}
                              {pick.species_type2 && <TypeBadge type={pick.species_type2} />}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function DraftBoardPage() {
  const { seasonId, seasons, setSeasonId } = useActiveSeason()
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('grid')

  useEffect(() => {
    if (!seasonId) { setLoading(false); return }
    setLoading(true)
    axios.get(`/draft/${seasonId}/board`)
      .then(r => setPicks(r.data))
      .catch(() => setPicks([]))
      .finally(() => setLoading(false))
  }, [seasonId])

  const teams = useMemo(() => Array.from(new Set(picks.map(p => p.team_name))), [picks])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Draft Board</h1>
        <div className="flex items-center gap-3">
          {seasons.length > 1 && (
            <select value={seasonId ?? ''} onChange={e => setSeasonId(+e.target.value)}
              className="border rounded px-2 py-1 text-sm"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
            {(['grid', 'teams'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-4 py-1.5 text-sm capitalize transition-all"
                style={{
                  background: view === v ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: view === v ? '#fff' : 'var(--color-text-muted)',
                }}>
                {v === 'grid' ? '⊞ Grid' : '☰ Teams'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : picks.length === 0 ? (
        <div className="p-8 text-center rounded-xl border"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          No draft picks yet.{' '}
          <Link to="/draft" style={{ color: 'var(--color-primary)' }}>Go to Draft Room →</Link>
        </div>
      ) : view === 'grid' ? (
        <GridView picks={picks} teams={teams} />
      ) : (
        <TeamsView picks={picks} />
      )}
    </div>
  )
}

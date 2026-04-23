import { useState, useEffect } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../hooks/useActiveSeason'

// ── Types ────────────────────────────────────────────────────────────────────

interface MoveKill { move: string; total: number; direct: number; passive: number }
interface MatchupSpecies { id: number; name: string }
interface MatchupCell { attacker_id: number; defender_id: number; count: number }
interface MatchupMatrix { species: MatchupSpecies[]; cells: MatchupCell[] }
interface TurnBucket { turn: number; kills: number }
interface WinCondition {
  total_matches: number
  matches_with_game1_data: number
  game1_winner_wins_match_count: number
  game1_winner_wins_match_pct: number | null
  message?: string
}

// ── Bar helpers ───────────────────────────────────────────────────────────────

function Bar({ value, max, color, height = 24 }: { value: number; max: number; color: string; height?: number }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div style={{ height, background: 'var(--color-bg)', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
    </div>
  )
}

// ── Move Kill Leaderboard ────────────────────────────────────────────────────

function MoveKills({ data }: { data: MoveKill[] }) {
  if (data.length === 0) return <Empty />
  const maxTotal = Math.max(...data.map(d => d.total))
  return (
    <div className="space-y-1.5">
      <div className="grid text-xs font-medium mb-2" style={{ gridTemplateColumns: '160px 1fr 50px 50px 50px', color: 'var(--color-text-muted)', gap: 8 }}>
        <span>Move</span><span>KOs</span><span className="text-right">Total</span><span className="text-right text-blue-400">Direct</span><span className="text-right" style={{ color: '#8b5cf6' }}>Passive</span>
      </div>
      {data.map(d => (
        <div key={d.move} className="grid items-center text-sm" style={{ gridTemplateColumns: '160px 1fr 50px 50px 50px', gap: 8 }}>
          <span className="font-medium truncate">{d.move}</span>
          <Bar value={d.total} max={maxTotal} color="#3b82f6" height={18} />
          <span className="text-right font-mono text-xs">{d.total}</span>
          <span className="text-right font-mono text-xs text-blue-400">{d.direct}</span>
          <span className="text-right font-mono text-xs" style={{ color: '#8b5cf6' }}>{d.passive}</span>
        </div>
      ))}
    </div>
  )
}

// ── Matchup Matrix ────────────────────────────────────────────────────────────

function MatchupMatrixView({ data }: { data: MatchupMatrix }) {
  const [hovered, setHovered] = useState<{ a: number; d: number; count: number } | null>(null)
  if (data.species.length === 0) return <Empty />

  const cellMap: Record<string, number> = {}
  for (const c of data.cells) cellMap[`${c.attacker_id}:${c.defender_id}`] = c.count
  const maxCount = data.cells.length > 0 ? Math.max(...data.cells.map(c => c.count)) : 1

  const cellSize = 28

  return (
    <div>
      {hovered && (
        <div className="text-xs mb-2 px-3 py-1.5 rounded" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
          <span className="font-medium">{data.species.find(s => s.id === hovered.a)?.name}</span>
          {" → KO'd "}
          <span className="font-medium">{data.species.find(s => s.id === hovered.d)?.name}</span>
          {' · '}
          <span className="font-bold">{hovered.count}×</span>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderSpacing: 2, borderCollapse: 'separate' }}>
          <thead>
            <tr>
              <th style={{ width: 80, fontSize: '0.65rem', color: 'var(--color-text-muted)', textAlign: 'right', paddingRight: 4 }}>
                ↓atk / def→
              </th>
              {data.species.map(s => (
                <th key={s.id} style={{ width: cellSize, maxWidth: cellSize, fontSize: '0.55rem', color: 'var(--color-text-muted)', writingMode: 'vertical-rl', paddingBottom: 4, textAlign: 'left' }}>
                  {s.name.length > 10 ? s.name.substring(0, 9) + '…' : s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.species.map(atk => (
              <tr key={atk.id}>
                <td style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', textAlign: 'right', paddingRight: 4, whiteSpace: 'nowrap' }}>
                  {atk.name.length > 10 ? atk.name.substring(0, 9) + '…' : atk.name}
                </td>
                {data.species.map(def => {
                  const count = cellMap[`${atk.id}:${def.id}`] ?? 0
                  const intensity = maxCount > 0 ? count / maxCount : 0
                  return (
                    <td key={def.id}
                      onMouseEnter={() => count > 0 && setHovered({ a: atk.id, d: def.id, count })}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        width: cellSize, height: cellSize,
                        background: count > 0 ? `rgba(59,130,246,${0.15 + intensity * 0.8})` : 'var(--color-bg)',
                        borderRadius: 3,
                        cursor: count > 0 ? 'pointer' : 'default',
                        textAlign: 'center',
                        fontSize: '0.6rem',
                        color: count > 0 ? '#fff' : 'transparent',
                        fontWeight: 600,
                      }}>
                      {count > 0 ? count : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Turn Distribution ─────────────────────────────────────────────────────────

function TurnDist({ data }: { data: TurnBucket[] }) {
  if (data.length === 0) return <Empty />
  const maxKills = Math.max(...data.map(d => d.kills))
  return (
    <div className="space-y-1">
      <div className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
        KOs per turn — showing when eliminations happen throughout the game
      </div>
      {data.map(d => (
        <div key={d.turn} className="flex items-center gap-3 text-sm">
          <span className="w-12 text-right font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>T{d.turn}</span>
          <Bar value={d.kills} max={maxKills} color="#f59e0b" height={16} />
          <span className="w-6 text-right font-mono text-xs">{d.kills}</span>
        </div>
      ))}
    </div>
  )
}

// ── Win Conditions ───────────────────────────────────────────────────────────

function WinConditions({ data }: { data: WinCondition }) {
  if (data.message) return <Empty message={data.message} />
  const pct = data.game1_winner_wins_match_pct

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Confirmed matches" value={String(data.total_matches)} />
        <Stat label="With game 1 data" value={String(data.matches_with_game1_data)} />
        <Stat
          label="Win G1 → win match"
          value={pct !== null ? `${pct}%` : '—'}
          color={pct !== null && pct >= 60 ? '#22c55e' : 'var(--color-text)'}
        />
      </div>
      {pct !== null && (
        <div>
          <div className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Teams that win Game 1 win the overall match
          </div>
          <div className="h-8 rounded-lg overflow-hidden" style={{ background: 'var(--color-bg)' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e', borderRadius: 8, transition: 'width 0.5s', display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
              <span className="text-xs font-bold text-white">{pct}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
      <div className="text-2xl font-bold" style={{ color: color ?? 'var(--color-text)' }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  )
}

function Empty({ message }: { message?: string }) {
  return (
    <div className="py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
      {message ?? 'No data yet — log some games to see analytics.'}
    </div>
  )
}

function Section({ title, children, loading }: { title: string; children: React.ReactNode; loading: boolean }) {
  return (
    <div className="rounded-xl border p-5 space-y-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
      <h2 className="text-base font-semibold">{title}</h2>
      {loading ? (
        <div className="py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : children}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { seasonId, seasons, setSeasonId } = useActiveSeason()

  const [moveKills, setMoveKills] = useState<MoveKill[]>([])
  const [matrix, setMatrix] = useState<MatchupMatrix>({ species: [], cells: [] })
  const [turnDist, setTurnDist] = useState<TurnBucket[]>([])
  const [winCond, setWinCond] = useState<WinCondition | null>(null)
  const [loading, setLoading] = useState({ moves: true, matrix: true, turns: true, wins: true })

  useEffect(() => {
    if (!seasonId) return
    setLoading({ moves: true, matrix: true, turns: true, wins: true })

    axios.get(`/seasons/${seasonId}/analytics/move-kills`)
      .then(r => setMoveKills(r.data))
      .catch(() => setMoveKills([]))
      .finally(() => setLoading(prev => ({ ...prev, moves: false })))

    axios.get(`/seasons/${seasonId}/analytics/matchup-matrix`)
      .then(r => setMatrix(r.data))
      .catch(() => setMatrix({ species: [], cells: [] }))
      .finally(() => setLoading(prev => ({ ...prev, matrix: false })))

    axios.get(`/seasons/${seasonId}/analytics/turn-distribution`)
      .then(r => setTurnDist(r.data))
      .catch(() => setTurnDist([]))
      .finally(() => setLoading(prev => ({ ...prev, turns: false })))

    axios.get(`/seasons/${seasonId}/analytics/win-conditions`)
      .then(r => setWinCond(r.data))
      .catch(() => setWinCond(null))
      .finally(() => setLoading(prev => ({ ...prev, wins: false })))
  }, [seasonId])

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        {seasons.length > 1 && (
          <select value={seasonId ?? ''} onChange={e => setSeasonId(+e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      <Section title="Move Kill Leaderboard" loading={loading.moves}>
        <MoveKills data={moveKills} />
      </Section>

      <Section title="Win Conditions" loading={loading.wins}>
        {winCond ? <WinConditions data={winCond} /> : <Empty />}
      </Section>

      <Section title="Turn Distribution — when do KOs happen?" loading={loading.turns}>
        <TurnDist data={turnDist} />
      </Section>

      <Section title="Pokemon Matchup Matrix — direct KOs (top 20 by involvement)" loading={loading.matrix}>
        <MatchupMatrixView data={matrix} />
      </Section>
    </div>
  )
}

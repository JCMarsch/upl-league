import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useActiveSeason } from '../hooks/useActiveSeason'

interface PlayoffTeam { team_id: number; team_name: string }

interface PlayoffMatchup {
  slot: number
  seeds: number[]
  match_id: number | null
  winner_team_id?: number | null
  loser_team_id?: number | null
  team1?: PlayoffTeam | null
  team2?: PlayoffTeam | null
}

interface PlayoffRound {
  round_number: number
  name: string
  consolation: boolean
  matchups: PlayoffMatchup[]
}

interface PlayoffData {
  configured: boolean
  locked_in: boolean
  bracket: {
    num_teams: number
    has_consolation: boolean
    rounds: PlayoffRound[]
  } | null
}

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#8b5cf6', B: '#3b82f6', C: '#22c55e', D: '#ef4444',
}

function MatchupCard({ mu, isFirstRound }: { mu: PlayoffMatchup; isFirstRound: boolean }) {
  const t1 = mu.team1?.team_name ?? (isFirstRound && mu.seeds[0] ? `Seed ${mu.seeds[0]}` : 'TBD')
  const t2 = mu.team2?.team_name ?? (isFirstRound && mu.seeds[1] ? `Seed ${mu.seeds[1]}` : 'TBD')
  const isTbd = !mu.team1 && !mu.team2
  const winner = mu.winner_team_id

  return (
    <div
      className="border rounded-lg p-3 text-sm space-y-2"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-surface)',
        opacity: isTbd ? 0.5 : 1,
      }}
    >
      {[{ team: mu.team1, name: t1, seed: mu.seeds[0] }, { team: mu.team2, name: t2, seed: mu.seeds[1] }].map(
        ({ team, name, seed }, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {seed && isFirstRound && (
                <span className="text-xs w-5 text-center shrink-0 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {seed}
                </span>
              )}
              <span
                className={`font-medium truncate ${winner && team && winner === team.team_id ? 'text-green-600' : winner && team && winner !== team.team_id ? 'opacity-40' : ''}`}
              >
                {name}
              </span>
            </div>
          </div>
        )
      )}
      {mu.match_id && (
        <div className="pt-1 border-t text-xs" style={{ borderColor: 'var(--color-border)' }}>
          <Link to={`/matches/${mu.match_id}`} className="hover:underline" style={{ color: 'var(--color-primary)' }}>
            View match →
          </Link>
        </div>
      )}
    </div>
  )
}

export default function PlayoffsPage() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [data, setData] = useState<PlayoffData | null>(null)
  const [loading, setLoading] = useState(false)

  const sid = selectedSeason ?? seasonId

  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])

  useEffect(() => {
    if (!sid) return
    setLoading(true)
    axios.get(`/seasons/${sid}/playoffs`)
      .then(r => setData(r.data))
      .catch(() => setData({ configured: false, locked_in: false, bracket: null }))
      .finally(() => setLoading(false))
  }, [sid])

  const bracket = data?.bracket
  const mainRounds = bracket?.rounds.filter(r => !r.consolation) ?? []
  const consolationRounds = bracket?.rounds.filter(r => r.consolation) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Playoffs</h1>
        {seasons.length > 1 && (
          <select
            value={sid ?? ''}
            onChange={e => setSelectedSeason(+e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {loading && (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      )}

      {!loading && !data?.configured && (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Playoffs have not been configured for this season yet.
        </div>
      )}

      {!loading && bracket && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {bracket.num_teams}-team · Single Elimination
              {bracket.has_consolation ? ' · 3rd place match' : ''}
            </span>
            {data?.locked_in ? (
              <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">Bracket Set</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">
                Preview — based on current standings
              </span>
            )}
          </div>

          {/* Main bracket */}
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-2 items-start">
              {mainRounds.map(rd => (
                <div key={rd.round_number} className="w-52 space-y-2">
                  <div
                    className="text-xs font-semibold text-center py-1.5 rounded"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    {rd.name}
                  </div>
                  <div className="space-y-2">
                    {rd.matchups.map(mu => (
                      <MatchupCard key={mu.slot} mu={mu} isFirstRound={rd.round_number === 1} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Consolation */}
          {consolationRounds.map(rd => (
            <div key={`con-${rd.round_number}`} className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                — {rd.name} —
              </p>
              <div className="flex gap-4">
                {rd.matchups.map(mu => (
                  <div key={mu.slot} className="w-52">
                    <MatchupCard mu={mu} isFirstRound={false} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

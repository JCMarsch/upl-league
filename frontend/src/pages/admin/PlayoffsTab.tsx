import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useActiveSeason } from '../../hooks/useActiveSeason'

interface PlayoffTeam {
  team_id: number
  team_name: string
}

interface PlayoffMatchup {
  slot: number
  seeds: number[]
  from: { round: number; slot: number; result: string }[]
  match_id: number | null
  home_team_id?: number
  away_team_id?: number
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

interface PlayoffBracket {
  num_teams: number
  format: string
  has_consolation: boolean
  locked_in: boolean
  rounds: PlayoffRound[]
}

interface PlayoffData {
  configured: boolean
  locked_in: boolean
  bracket: PlayoffBracket | null
}

const NUM_TEAMS_OPTIONS = [2, 4, 8, 16]

function MatchupCard({ mu, showSeeds }: { mu: PlayoffMatchup; showSeeds: boolean }) {
  const t1 = mu.team1?.team_name ?? (showSeeds && mu.seeds[0] ? `Seed ${mu.seeds[0]}` : 'TBD')
  const t2 = mu.team2?.team_name ?? (showSeeds && mu.seeds[1] ? `Seed ${mu.seeds[1]}` : 'TBD')

  return (
    <div
      className="border rounded p-3 text-sm space-y-1"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-medium ${mu.winner_team_id && mu.winner_team_id === mu.home_team_id ? 'text-green-600' : ''}`}
        >
          {t1}
        </span>
        {mu.seeds[0] && showSeeds && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">#{mu.seeds[0]}</span>
        )}
      </div>
      <div className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
        vs
      </div>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-medium ${mu.winner_team_id && mu.winner_team_id === mu.away_team_id ? 'text-green-600' : ''}`}
        >
          {t2}
        </span>
        {mu.seeds[1] && showSeeds && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">#{mu.seeds[1]}</span>
        )}
      </div>
      {mu.match_id && (
        <div className="pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <Link
            to={`/matches/${mu.match_id}`}
            className="text-xs hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            View match →
          </Link>
        </div>
      )}
    </div>
  )
}

export default function PlayoffsTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [data, setData] = useState<PlayoffData | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  // Config form state
  const [numTeams, setNumTeams] = useState(4)
  const [hasConsolation, setHasConsolation] = useState(true)

  const sid = selectedSeason ?? seasonId

  useEffect(() => {
    if (seasonId && !selectedSeason) setSelectedSeason(seasonId)
  }, [seasonId])

  const load = () => {
    if (!sid) return
    setLoading(true)
    axios
      .get(`/seasons/${sid}/playoffs`)
      .then(r => setData(r.data))
      .catch(() => setData({ configured: false, locked_in: false, bracket: null }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [sid])

  const configure = async () => {
    if (!sid) return
    setErr(''); setMsg('')
    try {
      const r = await axios.post(
        `/seasons/${sid}/playoffs/configure`,
        { num_teams: numTeams, format: 'single', has_consolation: hasConsolation },
        { withCredentials: true },
      )
      setData(r.data)
      setMsg('Bracket configured.')
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to configure')
    }
  }

  const lockIn = async () => {
    if (!sid) return
    if (!window.confirm('Lock in the playoff bracket based on current standings? This creates the round 1 matches and cannot be undone.')) return
    setErr(''); setMsg('')
    try {
      const r = await axios.post(`/seasons/${sid}/playoffs/lock-in`, {}, { withCredentials: true })
      setData(r.data)
      setMsg('Playoffs locked in. Round 1 matches created.')
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to lock in')
    }
  }

  const advance = async (roundNumber: number) => {
    if (!sid) return
    if (!window.confirm(`Advance from Round ${roundNumber}? All matches in that round must be confirmed.`)) return
    setErr(''); setMsg('')
    try {
      const r = await axios.post(
        `/seasons/${sid}/playoffs/advance`,
        null,
        { params: { round_number: roundNumber }, withCredentials: true },
      )
      setData(r.data)
      setMsg(`Round ${roundNumber} advanced.`)
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to advance')
    }
  }

  const bracket = data?.bracket

  // Group rounds: main bracket + consolation (if any)
  const mainRounds = bracket?.rounds.filter(r => !r.consolation) ?? []
  const consolationRounds = bracket?.rounds.filter(r => r.consolation) ?? []

  // Determine which rounds can be advanced (last round where all matchups have match_id)
  const advancableRounds: number[] = []
  if (bracket?.locked_in) {
    for (const rd of mainRounds) {
      const allHaveMatches = rd.matchups.every(mu => mu.match_id)
      const nextExists = mainRounds.some(r => r.round_number === rd.round_number + 1)
      if (allHaveMatches && nextExists) {
        const nextRound = mainRounds.find(r => r.round_number === rd.round_number + 1)!
        const nextNeedsCreation = nextRound.matchups.some(mu => !mu.match_id)
        if (nextNeedsCreation) advancableRounds.push(rd.round_number)
      }
    }
    // Also check if consolation needs to be created after the semi round
    if (consolationRounds.length > 0) {
      const consolRd = consolationRounds[0]
      if (!consolRd.matchups[0]?.match_id) {
        const sfRoundNum = consolRd.matchups[0]?.from?.[0]?.round
        if (sfRoundNum !== undefined && !advancableRounds.includes(sfRoundNum)) {
          const sfRound = mainRounds.find(r => r.round_number === sfRoundNum)
          if (sfRound?.matchups.every(mu => mu.match_id)) {
            advancableRounds.push(sfRoundNum)
          }
        }
      }
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">Playoffs</h2>
        {seasons.length > 1 && (
          <select
            value={sid ?? ''}
            onChange={e => setSelectedSeason(+e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {err && <p className="text-sm text-red-500">{err}</p>}

      {/* Configuration panel */}
      {!bracket?.locked_in && (
        <div
          className="border rounded-xl p-4 space-y-4"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <h3 className="font-medium text-sm">Configure Bracket</h3>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Teams in playoffs</label>
              <select
                value={numTeams}
                onChange={e => setNumTeams(+e.target.value)}
                className="border rounded px-2 py-1 text-sm"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
              >
                {NUM_TEAMS_OPTIONS.map(n => (
                  <option key={n} value={n}>{n} teams</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Format</label>
              <div
                className="border rounded px-3 py-1 text-sm"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
              >
                Single Elimination
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hasConsolation}
                onChange={e => setHasConsolation(e.target.checked)}
              />
              3rd place match
            </label>
            <button
              onClick={configure}
              className="px-4 py-1.5 rounded text-white text-sm"
              style={{ background: 'var(--color-primary)' }}
            >
              {data?.configured ? 'Update Configuration' : 'Generate Preview'}
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Seeds are assigned from current standings. Teams are not locked in until you click Lock In below.
          </p>
        </div>
      )}

      {loading && (
        <div className="py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      )}

      {/* Bracket preview / display */}
      {bracket && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {bracket.num_teams}-team · Single Elimination
              {bracket.has_consolation ? ' · 3rd place match' : ''}
            </span>
            {bracket.locked_in ? (
              <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">Locked In</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">Preview (not locked)</span>
            )}
          </div>

          {/* Main bracket rounds */}
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-2">
              {mainRounds.map(rd => (
                <div key={rd.round_number} className="w-52 space-y-2">
                  <div className="text-xs font-semibold text-center py-1 rounded"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    {rd.name}
                  </div>
                  <div className="space-y-2">
                    {rd.matchups.map(mu => (
                      <MatchupCard key={mu.slot} mu={mu} showSeeds={rd.round_number === 1} />
                    ))}
                  </div>
                  {advancableRounds.includes(rd.round_number) && (
                    <button
                      onClick={() => advance(rd.round_number)}
                      className="w-full mt-1 px-3 py-1.5 rounded text-xs text-white"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      Advance Round {rd.round_number} →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Consolation bracket */}
          {consolationRounds.map(rd => (
            <div key={`consolation-${rd.round_number}`} className="space-y-2">
              <div className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                — {rd.name} —
              </div>
              <div className="flex gap-4">
                {rd.matchups.map(mu => (
                  <div key={mu.slot} className="w-52">
                    <MatchupCard mu={mu} showSeeds={false} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Lock-in button */}
          {!bracket.locked_in && (
            <div className="pt-2">
              <button
                onClick={lockIn}
                className="px-5 py-2 rounded text-white text-sm font-medium"
                style={{ background: '#16a34a' }}
              >
                Lock In Playoffs
              </button>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Creates Round 1 matches based on current standings. Cannot be undone.
              </p>
            </div>
          )}
        </div>
      )}

      {!loading && !bracket && (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Configure the bracket above to generate a preview.
        </div>
      )}
    </div>
  )
}

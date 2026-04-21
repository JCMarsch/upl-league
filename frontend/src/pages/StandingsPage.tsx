import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useActiveSeason } from '../hooks/useActiveSeason'

interface Standing {
  team_id: number
  team_name: string
  rank: number
  match_wins: number
  match_losses: number
  match_draws: number
  win_percentage: number
  game_differential: number
  match_differential: number
  total_kills: number
  total_deaths: number
  kill_death_differential: number
  streak: number
}

type SortKey = keyof Standing

export default function StandingsPage() {
  const { seasonId, seasons, setSeasonId } = useActiveSeason()
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    if (!seasonId) { setLoading(false); return }
    setLoading(true)
    axios.get(`/seasons/${seasonId}/standings`)
      .then(r => setStandings(r.data))
      .finally(() => setLoading(false))
  }, [seasonId])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(key === 'rank') }
  }

  const sorted = [...standings].sort((a, b) => {
    const av = a[sortKey] as number
    const bv = b[sortKey] as number
    return sortAsc ? av - bv : bv - av
  })

  const col = (label: string, key: SortKey, title?: string) => (
    <th
      onClick={() => toggleSort(key)}
      title={title}
      className="px-3 py-2 border-b text-right cursor-pointer select-none hover:opacity-70 whitespace-nowrap"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {label}{sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const diff = (n: number) => (
    <span style={{ color: n > 0 ? '#22c55e' : n < 0 ? '#ef4444' : 'var(--color-text-muted)' }}>
      {n > 0 ? '+' : ''}{n}
    </span>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Standings</h1>
        {seasons.length > 1 && (
          <select
            value={seasonId ?? ''}
            onChange={e => setSeasonId(+e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
      ) : standings.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>No standings data yet. Matches must be confirmed to appear here.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-sm border-collapse">
            <thead style={{ background: 'var(--color-surface)' }}>
              <tr>
                {col('#', 'rank')}
                <th className="px-3 py-2 border-b text-left" style={{ borderColor: 'var(--color-border)' }}>Team</th>
                {col('W', 'match_wins', 'Match Wins')}
                {col('L', 'match_losses', 'Match Losses')}
                {col('D', 'match_draws', 'Match Draws')}
                {col('Win%', 'win_percentage', 'Win Percentage')}
                {col('GD', 'game_differential', 'Game Differential')}
                {col('MD', 'match_differential', 'Match Differential')}
                {col('K', 'total_kills', 'Total Kills')}
                {col('D', 'total_deaths', 'Total Deaths')}
                {col('KD', 'kill_death_differential', 'Kill/Death Differential')}
                {col('Streak', 'streak', 'Current Win Streak (negative = losing)')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr
                  key={s.team_id}
                  className={i % 2 === 0 ? '' : ''}
                  style={{ background: i % 2 === 0 ? 'transparent' : 'var(--color-surface)' }}
                >
                  <td className="px-3 py-2 border-b text-right font-mono text-xs" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>{s.rank}</td>
                  <td className="px-3 py-2 border-b font-medium" style={{ borderColor: 'var(--color-border)' }}>
                    <Link to={`/teams/${s.team_id}`} className="hover:underline" style={{ color: 'var(--color-primary)' }}>
                      {s.team_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 border-b text-right font-bold" style={{ borderColor: 'var(--color-border)', color: '#22c55e' }}>{s.match_wins}</td>
                  <td className="px-3 py-2 border-b text-right font-bold" style={{ borderColor: 'var(--color-border)', color: '#ef4444' }}>{s.match_losses}</td>
                  <td className="px-3 py-2 border-b text-right" style={{ borderColor: 'var(--color-border)' }}>{s.match_draws}</td>
                  <td className="px-3 py-2 border-b text-right" style={{ borderColor: 'var(--color-border)' }}>{(s.win_percentage * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2 border-b text-right" style={{ borderColor: 'var(--color-border)' }}>{diff(s.game_differential)}</td>
                  <td className="px-3 py-2 border-b text-right" style={{ borderColor: 'var(--color-border)' }}>{diff(s.match_differential)}</td>
                  <td className="px-3 py-2 border-b text-right" style={{ borderColor: 'var(--color-border)' }}>{s.total_kills}</td>
                  <td className="px-3 py-2 border-b text-right" style={{ borderColor: 'var(--color-border)' }}>{s.total_deaths}</td>
                  <td className="px-3 py-2 border-b text-right" style={{ borderColor: 'var(--color-border)' }}>{diff(s.kill_death_differential)}</td>
                  <td className="px-3 py-2 border-b text-right" style={{ borderColor: 'var(--color-border)' }}>
                    {s.streak > 0 ? <span style={{ color: '#22c55e' }}>W{s.streak}</span>
                      : s.streak < 0 ? <span style={{ color: '#ef4444' }}>L{Math.abs(s.streak)}</span>
                      : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Click column headers to sort. GD = Game Differential, MD = Match Differential, KD = Kill/Death Differential.</p>
    </div>
  )
}

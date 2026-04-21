import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'

interface SeasonHistoryDetail {
  season: { id: number; name: string; year: number }
  results: { team_id: number; rank: number; champion: boolean }[]
  awards: { name: string; team_id: number | null }[]
}

interface Team { id: number; name: string }

export default function SeasonHistoryPage() {
  const { seasonId } = useParams<{ seasonId: string }>()
  const [data, setData] = useState<SeasonHistoryDetail | null>(null)
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!seasonId) return
    axios.get(`/history/${seasonId}`)
      .then(async r => {
        setData(r.data)
        const teamRes = await axios.get(`/seasons/${seasonId}/teams`)
        const m: Record<number, Team> = {}
        for (const t of teamRes.data) m[t.id] = t
        setTeams(m)
      })
      .catch(() => setError('Season not found'))
      .finally(() => setLoading(false))
  }, [seasonId])

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  if (error || !data) return <div className="p-8 text-center text-red-500">{error || 'Not found'}</div>

  const teamName = (id: number | null) => id ? (teams[id]?.name ?? `Team ${id}`) : 'Unknown'
  const sorted = [...data.results].sort((a, b) => a.rank - b.rank)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <Link to="/history" className="hover:underline">League History</Link> / {data.season.name}
      </div>

      <div>
        <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{data.season.year}</div>
        <h1 className="text-3xl font-bold">{data.season.name}</h1>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Final Standings</h2>
        <div className="space-y-2">
          {sorted.map(r => (
            <div key={r.team_id} className="flex items-center gap-4 p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <div className="w-8 text-center font-bold text-lg" style={{ color: r.rank === 1 ? '#f59e0b' : 'var(--color-text-muted)' }}>
                {r.rank === 1 ? '🏆' : `#${r.rank}`}
              </div>
              <Link to={`/teams/${r.team_id}`} className="font-semibold hover:underline flex-1" style={{ color: 'var(--color-text)' }}>
                {teamName(r.team_id)}
              </Link>
              {r.champion && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b' }}>Champion</span>}
            </div>
          ))}
        </div>
      </div>

      {data.awards.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Awards</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.awards.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                <span className="text-2xl">🏅</span>
                <div>
                  <div className="font-semibold">{a.name}</div>
                  {a.team_id && <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{teamName(a.team_id)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

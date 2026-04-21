import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'

interface CareerSeason {
  team_id: number
  team_name: string
  season_id: number
  final_rank: number | null
  champion: boolean
  match_wins: number
  total_kills: number
}

interface CareerData {
  user_id: number
  seasons: CareerSeason[]
  total_seasons: number
  championships: number
}

export default function ManagerPage() {
  const { userId } = useParams<{ userId: string }>()
  const [career, setCareer] = useState<CareerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return
    axios.get(`/managers/${userId}/career`)
      .then(r => setCareer(r.data))
      .catch(() => setError('Manager not found'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  if (error || !career) return <div className="p-8 text-center text-red-500">{error || 'Not found'}</div>

  const totalWins = career.seasons.reduce((s, c) => s + c.match_wins, 0)
  const totalKills = career.seasons.reduce((s, c) => s + c.total_kills, 0)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Manager Career</h1>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Seasons', value: career.total_seasons },
          { label: 'Championships', value: career.championships },
          { label: 'Total Match Wins', value: totalWins },
        ].map(stat => (
          <div key={stat.label} className="rounded-lg border p-4 text-center" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            <div className="text-3xl font-bold" style={{ color: 'var(--color-primary)' }}>{stat.value}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Season History</h2>
        <div className="space-y-2">
          {career.seasons.map(s => (
            <div key={s.team_id} className="flex items-center justify-between p-4 rounded-lg border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <div>
                <Link to={`/teams/${s.team_id}`} className="font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
                  {s.team_name}
                </Link>
                <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Season {s.season_id} · {s.match_wins} wins
                  {s.final_rank && ` · Finished #${s.final_rank}`}
                </div>
              </div>
              {s.champion && <span className="text-2xl" title="Champion">🏆</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

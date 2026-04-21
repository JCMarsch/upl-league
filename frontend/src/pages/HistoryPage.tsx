import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

interface SeasonSummary {
  season_id: number
  name: string
  year: number
  format: string
  champion_team: string | null
}

export default function HistoryPage() {
  const [history, setHistory] = useState<SeasonSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/history')
      .then(r => setHistory(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">League History</h1>

      {history.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>No completed seasons yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {history.map(s => (
            <Link
              key={s.season_id}
              to={`/history/${s.season_id}`}
              className="block rounded-xl border p-6 hover:opacity-80 transition-opacity"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <div className="text-xs font-mono mb-1" style={{ color: 'var(--color-text-muted)' }}>{s.year} · {s.format}</div>
              <h2 className="text-xl font-bold">{s.name}</h2>
              {s.champion_team ? (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-yellow-500 text-lg">🏆</span>
                  <span className="font-medium">{s.champion_team}</span>
                </div>
              ) : (
                <div className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>No champion recorded</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

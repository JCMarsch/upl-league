import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useActiveSeason } from '../hooks/useActiveSeason'

interface Team {
  id: number
  name: string
  abbreviation: string | null
  logo_url: string | null
  primary_color: string
  points_remaining: number
  manager_id: number
}

export default function TeamsListPage() {
  const { seasonId, seasons, setSeasonId } = useActiveSeason()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!seasonId) { setLoading(false); return }
    setLoading(true)
    axios.get(`/seasons/${seasonId}/teams`)
      .then(r => setTeams(r.data))
      .finally(() => setLoading(false))
  }, [seasonId])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Teams</h1>
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
      ) : teams.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>No teams in this season yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map(team => (
            <Link
              key={team.id}
              to={`/teams/${team.id}`}
              className="block rounded-xl border p-5 hover:opacity-80 transition-opacity"
              style={{
                borderColor: team.primary_color ?? 'var(--color-border)',
                background: (team.primary_color ?? '#888') + '11',
              }}
            >
              <div className="flex items-center gap-4">
                {team.logo_url ? (
                  <img src={team.logo_url} alt={team.name} className="w-14 h-14 object-contain rounded-lg flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg flex items-center justify-center text-xl font-bold flex-shrink-0"
                    style={{ background: team.primary_color ?? 'var(--color-border)', color: 'white' }}>
                    {team.abbreviation ?? team.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-bold text-lg leading-tight">{team.name}</div>
                  {team.abbreviation && (
                    <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{team.abbreviation}</div>
                  )}
                  <div className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {team.points_remaining} pts remaining
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

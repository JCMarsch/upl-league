import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useActiveSeason } from '../hooks/useActiveSeason'

interface ScheduleItem {
  id: number
  season_id: number
  week_number: number
  home_team_id: number
  away_team_id: number
  status: string
}

interface Match {
  id: number
  schedule_id?: number
  season_id: number
  week_number: number
  home_team_id: number
  away_team_id: number
  home_games_won: number
  away_games_won: number
  winner_team_id: number | null
  status: string
}

interface Team {
  id: number
  name: string
  abbreviation: string | null
}

export default function SchedulePage() {
  const { seasonId, seasons, setSeasonId } = useActiveSeason()
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!seasonId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      axios.get(`/seasons/${seasonId}/schedule`),
      axios.get(`/seasons/${seasonId}/teams`),
    ]).then(([schedRes, teamRes]) => {
      setSchedule(schedRes.data)
      const teamMap: Record<number, Team> = {}
      for (const t of teamRes.data) teamMap[t.id] = t
      setTeams(teamMap)
    }).finally(() => setLoading(false))
  }, [seasonId])

  const weeks = Array.from(new Set(schedule.map(s => s.week_number))).sort((a, b) => a - b)

  const teamName = (id: number) => teams[id]?.name ?? `Team ${id}`
  const teamAbbr = (id: number) => teams[id]?.abbreviation ?? teamName(id).slice(0, 3).toUpperCase()

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      scheduled: 'var(--color-text-muted)',
      completed: '#22c55e',
      postponed: '#f59e0b',
      confirmed: '#22c55e',
      submitted: '#3b82f6',
      disputed: '#ef4444',
      pending: 'var(--color-text-muted)',
    }
    return (
      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: (map[status] ?? '#888') + '22', color: map[status] ?? '#888', border: `1px solid ${map[status] ?? '#888'}` }}>
        {status}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Schedule</h1>
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
      ) : schedule.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>No schedule yet. The admin needs to generate the schedule.</div>
      ) : (
        <div className="space-y-6">
          {weeks.map(week => {
            const weekMatches = schedule.filter(s => s.week_number === week)
            return (
              <div key={week}>
                <h2 className="text-lg font-semibold mb-3 pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  Week {week}
                </h2>
                <div className="space-y-2">
                  {weekMatches.map(sched => (
                    <div
                      key={sched.id}
                      className="flex items-center gap-4 p-4 rounded-lg border"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                    >
                      <div className="flex-1 text-right">
                        <Link to={`/teams/${sched.home_team_id}`} className="font-semibold hover:underline" style={{ color: 'var(--color-text)' }}>
                          {teamName(sched.home_team_id)}
                        </Link>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{teamAbbr(sched.home_team_id)}</div>
                      </div>

                      <div className="text-center min-w-[80px]">
                        <div className="font-bold text-lg">vs</div>
                        <div className="mt-1">{statusBadge(sched.status)}</div>
                      </div>

                      <div className="flex-1 text-left">
                        <Link to={`/teams/${sched.away_team_id}`} className="font-semibold hover:underline" style={{ color: 'var(--color-text)' }}>
                          {teamName(sched.away_team_id)}
                        </Link>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{teamAbbr(sched.away_team_id)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
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
  match_id: number | null
  home_games_won: number
  away_games_won: number
  match_status: string | null
  winner_team_id: number | null
}

interface Team {
  id: number
  name: string
  abbreviation: string | null
  primary_color: string
  secondary_color: string
  logo_url: string | null
}

type Filter = 'all' | 'upcoming' | 'completed'

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--color-text-muted)',
  submitted: '#3b82f6',
  confirmed: '#22c55e',
  disputed: '#ef4444',
  scheduled: 'var(--color-text-muted)',
  postponed: '#f59e0b',
}

function statusLabel(s: ScheduleItem): string {
  return s.match_status ?? s.status
}

function isCompleted(s: ScheduleItem) {
  return s.match_status === 'confirmed' || s.match_status === 'submitted'
}

function isUpcoming(s: ScheduleItem) {
  return !s.match_status || s.match_status === 'pending' || s.status === 'scheduled'
}

export default function SchedulePage() {
  const { seasonId, seasons, setSeasonId } = useActiveSeason()
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!seasonId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      axios.get(`/seasons/${seasonId}/schedule`),
      axios.get(`/seasons/${seasonId}/teams`),
    ]).then(([schedRes, teamRes]) => {
      const items: ScheduleItem[] = schedRes.data
      setSchedule(items)
      const teamMap: Record<number, Team> = {}
      for (const t of teamRes.data) teamMap[t.id] = t
      setTeams(teamMap)

      // Auto-expand: first week with non-confirmed matches, else last week
      const weeks = Array.from(new Set(items.map(s => s.week_number))).sort((a, b) => a - b)
      const currentWeek = weeks.find(w =>
        items.filter(s => s.week_number === w).some(s => !isCompleted(s))
      ) ?? weeks[weeks.length - 1]
      if (currentWeek) setExpanded(new Set([currentWeek]))
    }).finally(() => setLoading(false))
  }, [seasonId])

  const weeks = useMemo(
    () => Array.from(new Set(schedule.map(s => s.week_number))).sort((a, b) => a - b),
    [schedule]
  )

  const filteredSchedule = useMemo(() => {
    if (filter === 'completed') return schedule.filter(isCompleted)
    if (filter === 'upcoming') return schedule.filter(isUpcoming)
    return schedule
  }, [schedule, filter])

  const toggle = (week: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(week)) next.delete(week)
      else next.add(week)
      return next
    })
  }

  const teamName = (id: number) => teams[id]?.name ?? `Team ${id}`
  const teamAbbr = (id: number) => teams[id]?.abbreviation ?? teamName(id).slice(0, 3).toUpperCase()
  const teamColor = (id: number) => teams[id]?.primary_color ?? 'var(--color-text)'

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <div className="flex items-center gap-3">
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
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(['all', 'upcoming', 'completed'] as Filter[]).map(f => (
          <button key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-full text-sm capitalize transition-all"
            style={{
              background: filter === f ? 'var(--color-primary)' : 'var(--color-surface)',
              color: filter === f ? '#fff' : 'var(--color-text-muted)',
              border: filter === f ? 'none' : '1px solid var(--color-border)',
            }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : schedule.length === 0 ? (
        <div className="p-8 text-center rounded-xl border"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          No schedule yet. An admin needs to generate the schedule.
        </div>
      ) : (
        <div className="space-y-2">
          {weeks.map(week => {
            const weekItems = filteredSchedule.filter(s => s.week_number === week)
            const allItems = schedule.filter(s => s.week_number === week)
            if (weekItems.length === 0) return null

            const confirmedCount = allItems.filter(isCompleted).length
            const isOpen = expanded.has(week)

            // Week-level status summary
            const allDone = confirmedCount === allItems.length
            const someDone = confirmedCount > 0 && !allDone

            return (
              <div key={week} className="rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                {/* Accordion header */}
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:opacity-80 transition-opacity"
                  onClick={() => toggle(week)}>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">Week {week}</span>
                    <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      {allItems.length} match{allItems.length !== 1 ? 'es' : ''}
                    </span>
                    {allDone && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e' }}>
                        completed
                      </span>
                    )}
                    {someDone && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f6' }}>
                        {confirmedCount}/{allItems.length} done
                      </span>
                    )}
                  </div>
                  <span style={{ color: 'var(--color-text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    ▾
                  </span>
                </button>

                {/* Expanded match cards */}
                {isOpen && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-2"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                    {weekItems.map(item => {
                      const sl = statusLabel(item)
                      const hasScore = item.match_status && item.match_status !== 'pending'
                      const isWon = item.winner_team_id !== null

                      return (
                        <Link
                          key={item.id}
                          to={item.match_id ? `/matches/${item.match_id}` : '#'}
                          className="flex items-center gap-4 p-4 rounded-lg border transition-all hover:border-opacity-80"
                          style={{
                            borderColor: 'var(--color-border)',
                            background: 'var(--color-surface)',
                            textDecoration: 'none',
                            opacity: item.match_id ? 1 : 0.7,
                            cursor: item.match_id ? 'pointer' : 'default',
                          }}>
                          {/* Home team */}
                          <div className="flex-1 flex items-center gap-2 justify-end">
                            {teams[item.home_team_id]?.logo_url && (
                              <img src={teams[item.home_team_id].logo_url!} alt=""
                                className="w-7 h-7 rounded-full object-cover" />
                            )}
                            <div className="text-right">
                              <div className="font-semibold text-sm" style={{ color: teamColor(item.home_team_id) }}>
                                {teamAbbr(item.home_team_id)}
                              </div>
                              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                {teamName(item.home_team_id)}
                              </div>
                            </div>
                          </div>

                          {/* Score / vs */}
                          <div className="text-center min-w-[72px]">
                            {hasScore ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className={`text-xl font-bold ${item.winner_team_id === item.home_team_id ? '' : 'opacity-50'}`}>
                                  {item.home_games_won}
                                </span>
                                <span style={{ color: 'var(--color-text-muted)' }}>–</span>
                                <span className={`text-xl font-bold ${item.winner_team_id === item.away_team_id ? '' : 'opacity-50'}`}>
                                  {item.away_games_won}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm font-mono" style={{ color: 'var(--color-text-muted)' }}>vs</span>
                            )}
                            <div className="mt-1">
                              <span className="text-xs px-1.5 py-0.5 rounded-full"
                                style={{
                                  background: (STATUS_COLOR[sl] ?? '#888') + '22',
                                  color: STATUS_COLOR[sl] ?? '#888',
                                  border: `1px solid ${STATUS_COLOR[sl] ?? '#888'}`,
                                }}>
                                {sl}
                              </span>
                            </div>
                          </div>

                          {/* Away team */}
                          <div className="flex-1 flex items-center gap-2 justify-start">
                            <div className="text-left">
                              <div className="font-semibold text-sm" style={{ color: teamColor(item.away_team_id) }}>
                                {teamAbbr(item.away_team_id)}
                              </div>
                              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                {teamName(item.away_team_id)}
                              </div>
                            </div>
                            {teams[item.away_team_id]?.logo_url && (
                              <img src={teams[item.away_team_id].logo_url!} alt=""
                                className="w-7 h-7 rounded-full object-cover" />
                            )}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

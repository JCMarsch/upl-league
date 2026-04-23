import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useActiveSeason } from '../../hooks/useActiveSeason'

interface ScheduleItem {
  id: number
  week_number: number
  home_team_id: number
  away_team_id: number
  status: string
  match_id: number | null
  home_games_won: number
  away_games_won: number
  match_status: string | null
}

interface Team { id: number; name: string }

export default function ScheduleTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const sid = selectedSeason ?? seasonId

  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])

  const load = () => {
    if (!sid) return
    setLoading(true)
    Promise.all([
      axios.get(`/seasons/${sid}/schedule`),
      axios.get(`/seasons/${sid}/teams`),
    ])
      .then(([schedRes, teamsRes]) => {
        setSchedule(schedRes.data)
        setTeams(teamsRes.data)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [sid])

  const generateSchedule = async () => {
    if (!sid) return
    if (schedule.length > 0 && !window.confirm('A schedule already exists for this season. Generating again will add duplicate matches. Continue?')) return
    setGenerating(true); setErr(''); setMsg('')
    try {
      const r = await axios.post(`/seasons/${sid}/schedule/generate`, {}, { withCredentials: true })
      setMsg(`Schedule generated: ${r.data.weeks} weeks`)
      load()
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to generate schedule')
    } finally { setGenerating(false) }
  }

  const teamName = (id: number) => teams.find(t => t.id === id)?.name ?? `Team ${id}`

  const byWeek: Record<number, ScheduleItem[]> = {}
  for (const s of schedule) {
    if (!byWeek[s.week_number]) byWeek[s.week_number] = []
    byWeek[s.week_number].push(s)
  }
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b)

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="flex gap-2 items-center flex-wrap">
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
          <button
            onClick={generateSchedule}
            disabled={generating}
            className="px-4 py-1.5 rounded text-sm text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {generating ? 'Generating…' : 'Generate Round-Robin'}
          </button>
        </div>
      </div>

      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {err && <p className="text-sm text-red-500">{err}</p>}

      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Generates a round-robin schedule using all teams in the selected season. Each team plays every other team once.
        Requires at least 2 teams assigned to the season first.
      </p>

      {loading ? (
        <div className="py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : schedule.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No schedule yet. Click Generate Round-Robin above.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {weeks.length} weeks · {schedule.length} matches
          </div>
          {weeks.map(week => (
            <div key={week} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
              <div className="px-4 py-2 text-xs font-semibold" style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                Week {week}
              </div>
              {byWeek[week].map(s => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <span className="flex-1">{teamName(s.home_team_id)} vs {teamName(s.away_team_id)}</span>
                  <div className="flex items-center gap-3">
                    {s.match_status === 'confirmed' || s.match_status === 'submitted' ? (
                      <span className="font-mono text-sm">{s.home_games_won}–{s.away_games_won}</span>
                    ) : null}
                    <span className="text-xs px-2 py-0.5 rounded" style={{
                      background: s.match_status === 'confirmed' ? '#dcfce7' : s.match_status === 'submitted' ? '#dbeafe' : 'var(--color-bg)',
                      color: s.match_status === 'confirmed' ? '#16a34a' : s.match_status === 'submitted' ? '#2563eb' : 'var(--color-text-muted)',
                    }}>
                      {s.match_status ?? s.status}
                    </span>
                    {s.match_id && (
                      <Link to={`/matches/${s.match_id}`} className="text-xs hover:underline" style={{ color: 'var(--color-primary)' }}>
                        View →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

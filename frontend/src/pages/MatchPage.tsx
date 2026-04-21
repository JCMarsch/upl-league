import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

interface Match {
  id: number
  season_id: number
  week_number: number
  home_team_id: number
  away_team_id: number
  home_games_won: number
  away_games_won: number
  winner_team_id: number | null
  status: string
  notes?: string
}

interface Team {
  id: number
  name: string
}

export default function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { user } = useAuthStore()
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState('')

  const fetchMatch = () => {
    axios.get(`/matches/${matchId}`)
      .then(r => {
        setMatch(r.data)
        setHomeScore(r.data.home_games_won)
        setAwayScore(r.data.away_games_won)
        return axios.get(`/seasons/${r.data.season_id}/teams`)
      })
      .then(r => {
        const m: Record<number, Team> = {}
        for (const t of r.data) m[t.id] = t
        setTeams(m)
      })
      .catch(() => setError('Match not found'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (matchId) fetchMatch() }, [matchId])

  const isAdmin = user && (user.roles.includes('admin') || user.roles.includes('superadmin'))
  const canSubmit = user && match && match.status !== 'confirmed'

  const submitResult = async () => {
    setSubmitting(true); setMsg('')
    try {
      await axios.post(`/matches/${matchId}/submit`, {
        home_games_won: homeScore,
        away_games_won: awayScore,
        notes: notes || undefined,
      }, { withCredentials: true })
      setMsg('Result submitted!')
      setShowSubmit(false)
      fetchMatch()
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Failed to submit')
    } finally { setSubmitting(false) }
  }

  const confirmResult = async () => {
    if (!confirm('Confirm this match result?')) return
    setSubmitting(true)
    try {
      await axios.post(`/matches/${matchId}/confirm`, {}, { withCredentials: true })
      setMsg('Result confirmed!')
      fetchMatch()
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Failed to confirm')
    } finally { setSubmitting(false) }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  if (error || !match) return <div className="p-8 text-center text-red-500">{error || 'Match not found'}</div>

  const homeName = teams[match.home_team_id]?.name ?? `Team ${match.home_team_id}`
  const awayName = teams[match.away_team_id]?.name ?? `Team ${match.away_team_id}`

  const statusColor: Record<string, string> = {
    pending: 'var(--color-text-muted)', submitted: '#3b82f6',
    confirmed: '#22c55e', disputed: '#ef4444',
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <Link to="/schedule" className="hover:underline">Schedule</Link> / Week {match.week_number}
      </div>

      {/* Match header */}
      <div className="rounded-xl border p-8" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 text-center">
            <Link to={`/teams/${match.home_team_id}`} className="text-xl font-bold hover:underline" style={{ color: 'var(--color-primary)' }}>
              {homeName}
            </Link>
            <div className="text-5xl font-bold mt-3">{match.home_games_won}</div>
          </div>

          <div className="text-center">
            <div className="text-lg font-mono" style={{ color: 'var(--color-text-muted)' }}>vs</div>
            <div className="mt-2">
              <span className="text-sm px-2 py-1 rounded" style={{ background: (statusColor[match.status] ?? '#888') + '22', color: statusColor[match.status] ?? '#888' }}>
                {match.status}
              </span>
            </div>
            {match.winner_team_id && (
              <div className="mt-2 text-sm font-medium" style={{ color: '#22c55e' }}>
                {teams[match.winner_team_id]?.name ?? ''} wins
              </div>
            )}
            {match.home_games_won === match.away_games_won && match.status === 'confirmed' && (
              <div className="mt-2 text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>Draw</div>
            )}
          </div>

          <div className="flex-1 text-center">
            <Link to={`/teams/${match.away_team_id}`} className="text-xl font-bold hover:underline" style={{ color: 'var(--color-primary)' }}>
              {awayName}
            </Link>
            <div className="text-5xl font-bold mt-3">{match.away_games_won}</div>
          </div>
        </div>

        {match.notes && (
          <p className="mt-4 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>{match.notes}</p>
        )}
      </div>

      {msg && <p className={`text-sm ${msg.includes('ail') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}

      {/* Actions */}
      {canSubmit && (
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowSubmit(!showSubmit)}
            className="px-4 py-2 rounded text-white text-sm"
            style={{ background: 'var(--color-primary)' }}
          >
            {showSubmit ? 'Cancel' : 'Submit Result'}
          </button>
          {match.status === 'submitted' && (
            <button
              onClick={confirmResult}
              disabled={submitting}
              className="px-4 py-2 rounded text-white text-sm"
              style={{ background: '#22c55e' }}
            >
              Confirm Result
            </button>
          )}
        </div>
      )}

      {showSubmit && (
        <div className="border rounded-lg p-5 space-y-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <h3 className="font-semibold">Submit Result</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs mb-1">{homeName} Games Won</label>
              <input
                type="number" min={0} max={5}
                value={homeScore}
                onChange={e => setHomeScore(+e.target.value)}
                className="w-full border rounded px-3 py-2 text-center text-xl font-bold"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
              />
            </div>
            <div className="text-2xl font-bold pt-5">–</div>
            <div className="flex-1">
              <label className="block text-xs mb-1">{awayName} Games Won</label>
              <input
                type="number" min={0} max={5}
                value={awayScore}
                onChange={e => setAwayScore(+e.target.value)}
                className="w-full border rounded px-3 py-2 text-center text-xl font-bold"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs mb-1">Notes (optional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. replay links, anything noteworthy"
              className="w-full border rounded px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
            />
          </div>
          <button
            onClick={submitResult}
            disabled={submitting}
            className="px-5 py-2 rounded text-white text-sm disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../../hooks/useActiveSeason'

interface User { id: number; username: string; email: string; roles: string }
interface Match {
  id: number; week_number: number; status: string
  home_team_id: number; away_team_id: number
  home_games_won: number; away_games_won: number; notes: string | null
}
interface Team { id: number; name: string }

type Section = 'users' | 'matches'

export default function EditTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [section, setSection] = useState<Section>('users')
  const [users, setUsers] = useState<User[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [editingUser, setEditingUser] = useState<number | null>(null)
  const [editingMatch, setEditingMatch] = useState<number | null>(null)
  const [userForm, setUserForm] = useState<Partial<User>>({})
  const [matchForm, setMatchForm] = useState<Partial<Match>>({})
  const [msg, setMsg] = useState('')

  const sid = selectedSeason ?? seasonId
  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])
  useEffect(() => { axios.get('/admin/users', { withCredentials: true }).then(r => setUsers(r.data)) }, [])
  useEffect(() => {
    if (!sid) return
    axios.get(`/seasons/${sid}/schedule`)
      .then(r => {
        // ScheduleOut[] — filter to those with a match_id and remap to Match shape
        const items: any[] = r.data
        setMatches(
          items
            .filter((s: any) => s.match_id)
            .map((s: any) => ({
              id: s.match_id,
              week_number: s.week_number,
              home_team_id: s.home_team_id,
              away_team_id: s.away_team_id,
              home_games_won: s.home_games_won ?? 0,
              away_games_won: s.away_games_won ?? 0,
              status: s.match_status ?? s.status,
              notes: null,
            }))
        )
      })
      .catch(() => {})
    axios.get(`/seasons/${sid}/teams`).then(r => setTeams(r.data))
  }, [sid])

  const saveUser = async (id: number) => {
    try {
      await axios.patch(`/admin/users/${id}`, userForm, { withCredentials: true })
      setMsg('User updated.')
      setEditingUser(null)
      axios.get('/admin/users', { withCredentials: true }).then(r => setUsers(r.data))
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
  }

  const saveMatch = async (id: number) => {
    try {
      await axios.patch(`/admin/matches/${id}`, matchForm, { withCredentials: true })
      setMsg('Match updated.')
      setEditingMatch(null)
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
  }

  const teamName = (id: number) => teams.find(t => t.id === id)?.name ?? `Team ${id}`
  const ROLES = ['viewer', 'manager', 'admin', 'superadmin']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Edit</h2>
        <select value={sid ?? ''} onChange={e => setSelectedSeason(+e.target.value)}
          className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {msg && <p className="text-sm text-green-600 mb-2">{msg}</p>}

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {(['users', 'matches'] as Section[]).map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`px-4 py-2 text-sm capitalize ${section === s ? 'border-b-2 font-medium' : ''}`}
            style={{ borderColor: section === s ? 'var(--color-primary)' : 'transparent', color: section === s ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
            {s}
          </button>
        ))}
      </div>

      {/* Users */}
      {section === 'users' && (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="border rounded p-3" style={{ borderColor: 'var(--color-border)' }}>
              {editingUser === u.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1">Username</label>
                      <input value={userForm.username ?? u.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))}
                        className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1">Email</label>
                      <input value={userForm.email ?? u.email ?? ''} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
                        className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1">Roles (comma-separated)</label>
                      <input value={userForm.roles ?? u.roles} onChange={e => setUserForm(f => ({ ...f, roles: e.target.value }))}
                        className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Options: {ROLES.join(', ')}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveUser(u.id)} className="px-4 py-1.5 rounded text-white text-sm" style={{ background: 'var(--color-primary)' }}>Save</button>
                    <button onClick={() => setEditingUser(null)} className="px-4 py-1.5 rounded text-sm border" style={{ borderColor: 'var(--color-border)' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{u.username}</span>
                    <span className="ml-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>{u.email}</span>
                    <span className="ml-3 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{u.roles}</span>
                  </div>
                  <button onClick={() => { setEditingUser(u.id); setUserForm({}) }} className="text-sm px-3 py-1 border rounded" style={{ borderColor: 'var(--color-border)' }}>Edit</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Matches */}
      {section === 'matches' && (
        <div className="space-y-2">
          {matches.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No matches found for this season.</p>}
          {matches.map(m => (
            <div key={m.id} className="border rounded p-3" style={{ borderColor: 'var(--color-border)' }}>
              {editingMatch === m.id ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Week {m.week_number}: {teamName(m.home_team_id)} vs {teamName(m.away_team_id)}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1">{teamName(m.home_team_id)} Games Won</label>
                      <input type="number" value={matchForm.home_games_won ?? m.home_games_won} onChange={e => setMatchForm(f => ({ ...f, home_games_won: +e.target.value }))}
                        className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1">{teamName(m.away_team_id)} Games Won</label>
                      <input type="number" value={matchForm.away_games_won ?? m.away_games_won} onChange={e => setMatchForm(f => ({ ...f, away_games_won: +e.target.value }))}
                        className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1">Status</label>
                      <select value={matchForm.status ?? m.status} onChange={e => setMatchForm(f => ({ ...f, status: e.target.value }))}
                        className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                        {['pending', 'submitted', 'confirmed', 'disputed'].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1">Notes</label>
                      <input value={matchForm.notes ?? m.notes ?? ''} onChange={e => setMatchForm(f => ({ ...f, notes: e.target.value }))}
                        className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveMatch(m.id)} className="px-4 py-1.5 rounded text-white text-sm" style={{ background: 'var(--color-primary)' }}>Save</button>
                    <button onClick={() => setEditingMatch(null)} className="px-4 py-1.5 rounded text-sm border" style={{ borderColor: 'var(--color-border)' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">Wk {m.week_number}: {teamName(m.home_team_id)} vs {teamName(m.away_team_id)}</span>
                    <span className="ml-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>{m.home_games_won}–{m.away_games_won}</span>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{m.status}</span>
                  </div>
                  <button onClick={() => { setEditingMatch(m.id); setMatchForm({}) }} className="text-sm px-3 py-1 border rounded" style={{ borderColor: 'var(--color-border)' }}>Edit</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useActiveSeason } from '../../hooks/useActiveSeason'

interface Team { id: number; name: string; abbreviation: string | null; manager_id: number; points_remaining: number }
interface User { id: number; username: string; email: string }

export default function TeamsTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', abbreviation: '', manager_id: 0 })
  const [editForm, setEditForm] = useState<Partial<Team>>({})
  const [error, setError] = useState('')

  const sid = selectedSeason ?? seasonId

  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])
  useEffect(() => { axios.get('/admin/users', { withCredentials: true }).then(r => setUsers(r.data)) }, [])
  useEffect(() => {
    if (!sid) return
    axios.get(`/seasons/${sid}/teams`).then(r => setTeams(r.data))
  }, [sid])

  const createTeam = async () => {
    setError('')
    try {
      await axios.post(`/seasons/${sid}/teams`, form, { withCredentials: true })
      setCreating(false)
      setForm({ name: '', abbreviation: '', manager_id: 0 })
      axios.get(`/seasons/${sid}/teams`).then(r => setTeams(r.data))
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed') }
  }

  const saveEdit = async (id: number) => {
    try {
      await axios.patch(`/admin/teams/${id}`, editForm, { withCredentials: true })
      setEditingId(null)
      axios.get(`/seasons/${sid}/teams`).then(r => setTeams(r.data))
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed') }
  }

  const userMap = Object.fromEntries(users.map(u => [u.id, u.username]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Teams</h2>
        <div className="flex gap-3">
          <select value={sid ?? ''} onChange={e => setSelectedSeason(+e.target.value)}
            className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={() => setCreating(true)} className="px-4 py-2 rounded text-white text-sm" style={{ background: 'var(--color-primary)' }}>Add Team</button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {creating && (
        <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: 'var(--color-border)' }}>
          <h3 className="font-medium">Create Team</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1">Team Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1">Abbreviation</label>
              <input value={form.abbreviation} onChange={e => setForm(f => ({ ...f, abbreviation: e.target.value }))}
                className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1">Manager</label>
              <select value={form.manager_id} onChange={e => setForm(f => ({ ...f, manager_id: +e.target.value }))}
                className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                <option value={0}>Select manager...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createTeam} className="px-4 py-1.5 rounded text-white text-sm" style={{ background: 'var(--color-primary)' }}>Create</button>
            <button onClick={() => setCreating(false)} className="px-4 py-1.5 rounded text-sm border" style={{ borderColor: 'var(--color-border)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {teams.map(team => (
          <div key={team.id} className="border rounded-lg p-4" style={{ borderColor: 'var(--color-border)' }}>
            {editingId === team.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1">Team Name</label>
                    <input value={editForm.name ?? team.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Abbreviation</label>
                    <input value={editForm.abbreviation ?? team.abbreviation ?? ''} onChange={e => setEditForm(f => ({ ...f, abbreviation: e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Manager</label>
                    <select value={editForm.manager_id ?? team.manager_id} onChange={e => setEditForm(f => ({ ...f, manager_id: +e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                      {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Points Remaining</label>
                    <input type="number" value={editForm.points_remaining ?? team.points_remaining} onChange={e => setEditForm(f => ({ ...f, points_remaining: +e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(team.id)} className="px-4 py-1.5 rounded text-white text-sm" style={{ background: 'var(--color-primary)' }}>Save</button>
                  <button onClick={() => setEditingId(null)} className="px-4 py-1.5 rounded text-sm border" style={{ borderColor: 'var(--color-border)' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{team.name} {team.abbreviation && <span className="text-xs text-gray-500">({team.abbreviation})</span>}</div>
                  <div className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Manager: {userMap[team.manager_id] ?? team.manager_id} · Points remaining: {team.points_remaining}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to={`/teams/${team.id}`} className="text-sm px-3 py-1 border rounded" style={{ borderColor: 'var(--color-border)' }}>View</Link>
                  <button onClick={() => { setEditingId(team.id); setEditForm({}) }} className="text-sm px-3 py-1 border rounded" style={{ borderColor: 'var(--color-border)' }}>Edit</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {teams.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No teams in this season yet.</p>}
      </div>
    </div>
  )
}

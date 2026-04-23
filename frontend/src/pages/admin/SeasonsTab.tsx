import { useState, useEffect } from 'react'
import axios from 'axios'

interface Season {
  id: number
  name: string
  year: number
  status: string
  format: string
  points_budget: number
  roster_size: number
  draft_timer_seconds: number | null
  series_format: string
  required_slots: Record<string, number>
}

const STATUSES = ['setup', 'draft', 'regular', 'playoffs', 'complete']

export default function SeasonsTab() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', year: new Date().getFullYear(), format: 'VGC', points_budget: 100, roster_size: 10, draft_timer_seconds: 90, series_format: 'bo3', max_megas: 1 })
  const [editForm, setEditForm] = useState<Partial<Season>>({})
  const [error, setError] = useState('')

  const load = () => axios.get('/seasons').then(r => setSeasons(r.data))
  useEffect(() => { load() }, [])

  const createSeason = async () => {
    setError('')
    try {
      const { max_megas, ...rest } = form
      await axios.post('/seasons', { ...rest, required_slots: { mega: max_megas } }, { withCredentials: true })
      setCreating(false)
      setForm({ name: '', year: new Date().getFullYear(), format: 'VGC', points_budget: 100, roster_size: 10, draft_timer_seconds: 90, series_format: 'bo3', max_megas: 1 })
      load()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to create season')
    }
  }

  const saveEdit = async (id: number) => {
    try {
      const season = seasons.find(s => s.id === id)!
      const { max_megas, ...editRest } = editForm as any
      const payload = max_megas !== undefined
        ? { ...editRest, required_slots: { ...(season.required_slots || {}), mega: max_megas } }
        : editRest
      await axios.patch(`/admin/seasons/${id}`, payload, { withCredentials: true })
      setEditingId(null)
      load()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to update season')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Seasons</h2>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded text-white text-sm"
          style={{ background: 'var(--color-primary)' }}
        >
          New Season
        </button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {creating && (
        <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: 'var(--color-border)' }}>
          <h3 className="font-medium">Create Season</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Name', key: 'name', type: 'text' },
              { label: 'Year', key: 'year', type: 'number' },
              { label: 'Points Budget', key: 'points_budget', type: 'number' },
              { label: 'Roster Size', key: 'roster_size', type: 'number' },
              { label: 'Draft Timer (sec)', key: 'draft_timer_seconds', type: 'number' },
              { label: 'Max Megas per Team', key: 'max_megas', type: 'number' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="block text-xs mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? +e.target.value : e.target.value }))}
                  className="w-full border rounded px-2 py-1 text-sm"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs mb-1">Format</label>
              <select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}
                className="w-full border rounded px-2 py-1 text-sm"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                <option>VGC</option><option>Singles</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">Series Format</label>
              <select value={form.series_format} onChange={e => setForm(f => ({ ...f, series_format: e.target.value }))}
                className="w-full border rounded px-2 py-1 text-sm"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                <option value="bo3">Best of 3</option><option value="bo5">Best of 5</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createSeason} className="px-4 py-1.5 rounded text-white text-sm" style={{ background: 'var(--color-primary)' }}>Create</button>
            <button onClick={() => setCreating(false)} className="px-4 py-1.5 rounded text-sm border" style={{ borderColor: 'var(--color-border)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {seasons.map(season => (
          <div key={season.id} className="border rounded-lg p-4" style={{ borderColor: 'var(--color-border)' }}>
            {editingId === season.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Name', key: 'name', type: 'text' },
                    { label: 'Year', key: 'year', type: 'number' },
                    { label: 'Points Budget', key: 'points_budget', type: 'number' },
                    { label: 'Roster Size', key: 'roster_size', type: 'number' },
                    { label: 'Draft Timer (sec)', key: 'draft_timer_seconds', type: 'number' },
                  ].map(({ label, key, type }) => (
                    <div key={key}>
                      <label className="block text-xs mb-1">{label}</label>
                      <input
                        type={type}
                        value={(editForm as any)[key] ?? (season as any)[key]}
                        onChange={e => setEditForm(f => ({ ...f, [key]: type === 'number' ? +e.target.value : e.target.value }))}
                        className="w-full border rounded px-2 py-1 text-sm"
                        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs mb-1">Max Megas per Team</label>
                    <input
                      type="number"
                      value={(editForm as any).max_megas ?? (season.required_slots?.mega ?? 1)}
                      onChange={e => setEditForm(f => ({ ...f, max_megas: +e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-sm"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Status</label>
                    <select
                      value={editForm.status ?? season.status}
                      onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-sm"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(season.id)} className="px-4 py-1.5 rounded text-white text-sm" style={{ background: 'var(--color-primary)' }}>Save</button>
                  <button onClick={() => setEditingId(null)} className="px-4 py-1.5 rounded text-sm border" style={{ borderColor: 'var(--color-border)' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{season.name} <span className="text-xs text-gray-500">({season.year})</span></div>
                  <div className="text-sm mt-1 space-x-3" style={{ color: 'var(--color-text-muted)' }}>
                    <span>Status: <strong>{season.status}</strong></span>
                    <span>Format: {season.format}</span>
                    <span>Budget: {season.points_budget}pts</span>
                    <span>Roster: {season.roster_size}</span>
                    <span>Max Megas: {season.required_slots?.mega ?? 1}</span>
                  </div>
                </div>
                <button onClick={() => { setEditingId(season.id); setEditForm({}) }} className="text-sm px-3 py-1 border rounded" style={{ borderColor: 'var(--color-border)' }}>Edit</button>
              </div>
            )}
          </div>
        ))}
        {seasons.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No seasons yet. Create one above.</p>}
      </div>
    </div>
  )
}

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
const SLOT_TIERS = ['Mega', 'S', 'A', 'B', 'C', 'D'] as const

type SlotMap = Record<string, number>

function defaultSlots(): SlotMap {
  return { mega: 1, S: 1, A: 1, B: 1, C: 1, D: 1 }
}

function slotsFromSeason(s: Season): SlotMap {
  const rs = s.required_slots || {}
  return {
    mega: rs.mega ?? 1,
    S: rs.S ?? 1,
    A: rs.A ?? 1,
    B: rs.B ?? 1,
    C: rs.C ?? 1,
    D: rs.D ?? 1,
  }
}

function SlotsEditor({ slots, onChange }: { slots: SlotMap; onChange: (s: SlotMap) => void }) {
  return (
    <div className="col-span-2">
      <label className="block text-xs mb-1 font-medium">Required picks per tier (0 = no limit)</label>
      <div className="grid grid-cols-6 gap-2">
        {SLOT_TIERS.map(tier => {
          const key = tier === 'Mega' ? 'mega' : tier
          return (
            <div key={tier}>
              <label className="block text-xs mb-0.5 text-center" style={{ color: 'var(--color-text-muted)' }}>{tier}</label>
              <input
                type="number"
                min={0}
                value={slots[key] ?? 0}
                onChange={e => onChange({ ...slots, [key]: +e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm text-center"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function SeasonsTab() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: '', year: new Date().getFullYear(), format: 'VGC',
    points_budget: 100, roster_size: 10, draft_timer_seconds: 90, series_format: 'bo3',
  })
  const [formSlots, setFormSlots] = useState<SlotMap>(defaultSlots())
  const [editForm, setEditForm] = useState<Partial<Season>>({})
  const [editSlots, setEditSlots] = useState<SlotMap>({})
  const [error, setError] = useState('')

  const load = () => axios.get('/seasons').then(r => setSeasons(r.data))
  useEffect(() => { load() }, [])

  const createSeason = async () => {
    setError('')
    try {
      await axios.post('/seasons', { ...form, required_slots: formSlots }, { withCredentials: true })
      setCreating(false)
      setForm({ name: '', year: new Date().getFullYear(), format: 'VGC', points_budget: 100, roster_size: 10, draft_timer_seconds: 90, series_format: 'bo3' })
      setFormSlots(defaultSlots())
      load()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to create season')
    }
  }

  const startEdit = (season: Season) => {
    setEditingId(season.id)
    setEditForm({})
    setEditSlots(slotsFromSeason(season))
  }

  const saveEdit = async (id: number) => {
    try {
      await axios.patch(`/admin/seasons/${id}`, { ...editForm, required_slots: editSlots }, { withCredentials: true })
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
            <SlotsEditor slots={formSlots} onChange={setFormSlots} />
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
                  <SlotsEditor slots={editSlots} onChange={setEditSlots} />
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
                    {Object.keys(season.required_slots || {}).length > 0 && (
                      <span>Slots: {Object.entries(season.required_slots).map(([k, v]) => `${k}×${v}`).join(' ')}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => startEdit(season)} className="text-sm px-3 py-1 border rounded" style={{ borderColor: 'var(--color-border)' }}>Edit</button>
              </div>
            )}
          </div>
        ))}
        {seasons.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No seasons yet. Create one above.</p>}
      </div>
    </div>
  )
}

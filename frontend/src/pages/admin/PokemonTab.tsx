import { useState, useEffect } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../../hooks/useActiveSeason'

interface Pokemon {
  id: number; species_id: number; species_name: string
  tier: string | null; point_cost: number | null; is_legal: boolean
}

const TIERS = ['S', 'A', 'B', 'C', 'D', 'Free']

export default function PokemonTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [pokemon, setPokemon] = useState<Pokemon[]>([])
  const [edits, setEdits] = useState<Record<number, { tier?: string; point_cost?: number; is_legal?: boolean }>>({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [msg, setMsg] = useState('')

  const sid = selectedSeason ?? seasonId
  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])
  useEffect(() => {
    if (!sid) return
    axios.get(`/seasons/${sid}/pokemon`).then(r => setPokemon(r.data))
  }, [sid])

  const setEdit = (id: number, field: string, value: any) => {
    setEdits(e => ({ ...e, [id]: { ...e[id], [field]: value } }))
  }

  const saveAll = async () => {
    setSaving(true); setMsg('')
    const updates = Object.entries(edits).map(([id, vals]) => {
      const p = pokemon.find(p => p.id === +id)!
      return { species_id: p.species_id, ...vals }
    })
    try {
      await axios.post(`/seasons/${sid}/pokemon/bulk-update`, { updates }, { withCredentials: true })
      setEdits({})
      setMsg('Saved!')
      axios.get(`/seasons/${sid}/pokemon`).then(r => setPokemon(r.data))
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
    finally { setSaving(false) }
  }

  const lockTiers = async () => {
    if (!confirm('Lock tiers? This cannot be undone.')) return
    setLocking(true)
    try {
      await axios.post(`/seasons/${sid}/lock-tiers`, {}, { withCredentials: true })
      setMsg('Tiers locked!')
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
    finally { setLocking(false) }
  }

  const filtered = pokemon.filter(p => !search || p.species_name.toLowerCase().includes(search.toLowerCase()))
  const hasEdits = Object.keys(edits).length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Pokemon Tiers</h2>
        <div className="flex gap-3 flex-wrap">
          <select value={sid ?? ''} onChange={e => setSelectedSeason(+e.target.value)}
            className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
          {hasEdits && (
            <button onClick={saveAll} disabled={saving} className="px-4 py-1.5 rounded text-white text-sm" style={{ background: 'var(--color-primary)' }}>
              {saving ? 'Saving...' : `Save ${Object.keys(edits).length} change(s)`}
            </button>
          )}
          <button onClick={lockTiers} disabled={locking} className="px-4 py-1.5 rounded text-sm border border-red-400 text-red-600">
            {locking ? 'Locking...' : 'Lock Tiers'}
          </button>
        </div>
      </div>

      {msg && <p className="text-sm text-green-600">{msg}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: 'var(--color-surface)' }}>
              <th className="text-left px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>Pokemon</th>
              <th className="text-left px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>Tier</th>
              <th className="text-left px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>Cost</th>
              <th className="text-left px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>Legal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const edit = edits[p.id] ?? {}
              return (
                <tr key={p.id} className={Object.keys(edits[p.id] ?? {}).length ? 'bg-yellow-50' : ''}>
                  <td className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-border)' }}>{p.species_name}</td>
                  <td className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <select value={edit.tier ?? p.tier ?? ''} onChange={e => setEdit(p.id, 'tier', e.target.value)}
                      className="border rounded px-1 py-0.5 text-xs" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                      <option value="">-</option>
                      {TIERS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <input type="number" value={edit.point_cost ?? p.point_cost ?? ''} onChange={e => setEdit(p.id, 'point_cost', +e.target.value)}
                      className="border rounded px-1 py-0.5 text-xs w-16" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
                  </td>
                  <td className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <input type="checkbox" checked={edit.is_legal ?? p.is_legal} onChange={e => setEdit(p.id, 'is_legal', e.target.checked)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

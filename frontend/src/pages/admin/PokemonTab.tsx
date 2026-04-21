import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../../hooks/useActiveSeason'

interface Pokemon {
  id: number; species_id: number; species_name: string
  tier: string | null; point_cost: number | null; is_legal: boolean
}

const TIERS = ['S', 'A', 'B', 'C', 'D', 'Free']
const PAGE_SIZE = 50

export default function PokemonTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [pokemon, setPokemon] = useState<Pokemon[]>([])
  const [edits, setEdits] = useState<Record<number, { tier?: string; point_cost?: number; is_legal?: boolean }>>({})
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  const sid = selectedSeason ?? seasonId
  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])
  useEffect(() => {
    if (!sid) return
    setLoading(true)
    axios.get(`/seasons/${sid}/pokemon`)
      .then(r => { setPokemon(r.data); setPage(0) })
      .finally(() => setLoading(false))
  }, [sid])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [search, tierFilter])

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
      setMsg(`Saved ${updates.length} change(s)!`)
      const refresh = await axios.get(`/seasons/${sid}/pokemon`)
      setPokemon(refresh.data)
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
    finally { setSaving(false) }
  }

  const importAll = async () => {
    if (!confirm('Import all Pokemon species into this season? This will add any missing Pokemon.')) return
    setImporting(true); setMsg('')
    try {
      const r = await axios.post(`/seasons/${sid}/pokemon/populate`, {}, { withCredentials: true })
      setMsg(`Imported ${r.data.created} Pokemon (${r.data.total} total)`)
      setLoading(true)
      const refresh = await axios.get(`/seasons/${sid}/pokemon`)
      setPokemon(refresh.data)
      setPage(0)
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
    finally { setImporting(false); setLoading(false) }
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

  const filtered = useMemo(() => pokemon.filter(p => {
    if (search && !p.species_name?.toLowerCase().includes(search.toLowerCase())) return false
    if (tierFilter === 'none' && p.tier !== null) return false
    if (tierFilter && tierFilter !== 'none' && p.tier !== tierFilter) return false
    return true
  }), [pokemon, search, tierFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const hasEdits = Object.keys(edits).length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">
          Pokemon Tiers
          {pokemon.length > 0 && <span className="ml-2 text-sm font-normal" style={{ color: 'var(--color-text-muted)' }}>({pokemon.length} total)</span>}
        </h2>
        <div className="flex gap-2 flex-wrap">
          <select value={sid ?? ''} onChange={e => setSelectedSeason(+e.target.value)}
            className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={importAll} disabled={importing} className="px-3 py-1.5 rounded text-sm border" style={{ borderColor: 'var(--color-border)' }}>
            {importing ? 'Importing...' : 'Import All Pokemon'}
          </button>
          {hasEdits && (
            <button onClick={saveAll} disabled={saving} className="px-3 py-1.5 rounded text-white text-sm" style={{ background: 'var(--color-primary)' }}>
              {saving ? 'Saving...' : `Save ${Object.keys(edits).length} change(s)`}
            </button>
          )}
          <button onClick={lockTiers} disabled={locking} className="px-3 py-1.5 rounded text-sm border border-red-400 text-red-600">
            {locking ? 'Locking...' : 'Lock Tiers'}
          </button>
        </div>
      </div>

      {msg && <p className={`text-sm ${msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          placeholder="Search Pokemon..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm flex-1 min-w-40"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        />
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="">All Tiers</option>
          {TIERS.map(t => <option key={t} value={t}>Tier {t}</option>)}
          <option value="none">No Tier Assigned</option>
        </select>
        {(search || tierFilter) && (
          <span className="text-xs self-center" style={{ color: 'var(--color-text-muted)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading Pokemon...</div>
      ) : pokemon.length === 0 ? (
        <div className="p-8 text-center rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <p className="mb-3" style={{ color: 'var(--color-text-muted)' }}>No Pokemon in this season yet.</p>
          <button onClick={importAll} disabled={importing} className="px-4 py-2 rounded text-white" style={{ background: 'var(--color-primary)' }}>
            {importing ? 'Importing...' : 'Import All Pokemon'}
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
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
                {pageItems.map(p => {
                  const edit = edits[p.id] ?? {}
                  const isDirty = Object.keys(edits[p.id] ?? {}).length > 0
                  return (
                    <tr key={p.id} style={{ background: isDirty ? '#fefce8' : 'transparent' }}>
                      <td className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-border)', fontWeight: isDirty ? 600 : undefined }}>{p.species_name}</td>
                      <td className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                        <select value={edit.tier ?? p.tier ?? ''} onChange={e => setEdit(p.id, 'tier', e.target.value || null)}
                          className="border rounded px-1 py-0.5 text-xs" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                          <option value="">-</option>
                          {TIERS.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                        <input type="number" value={edit.point_cost ?? p.point_cost ?? ''} onChange={e => setEdit(p.id, 'point_cost', e.target.value === '' ? null : +e.target.value)}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-40"
                  style={{ borderColor: 'var(--color-border)' }}
                >«</button>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-40"
                  style={{ borderColor: 'var(--color-border)' }}
                >‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(0, Math.min(page - 2, totalPages - 5))
                  const p = start + i
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className="px-2 py-1 text-xs border rounded"
                      style={{
                        borderColor: 'var(--color-border)',
                        background: p === page ? 'var(--color-primary)' : 'transparent',
                        color: p === page ? 'white' : 'inherit',
                      }}
                    >{p + 1}</button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-40"
                  style={{ borderColor: 'var(--color-border)' }}
                >›</button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-40"
                  style={{ borderColor: 'var(--color-border)' }}
                >»</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

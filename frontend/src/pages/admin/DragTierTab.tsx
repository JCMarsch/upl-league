import { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'
import * as XLSX from 'xlsx'
import { useActiveSeason } from '../../hooks/useActiveSeason'
import { TIERS, TIER_COLORS } from '../../constants/tiers'

interface Pokemon {
  id: number
  species_id: number
  species_name: string
  species_forme_name: string | null
  tier: string | null
  point_cost: number | null
  is_legal: boolean
  is_mega: boolean
  species_sprite_url: string | null
}

interface TierConfig {
  regular: Record<string, number | null>
  mega: Record<string, number | null>
}

interface ImportRow {
  name: string
  tier: string
  point_cost: string | null
  matched: Pokemon | null
  warning: string
}

const VALID_TIERS = new Set(TIERS)
const TEMPLATE_ROWS = [['name', 'tier', 'point_cost'], ['charizard', 'S', '12'], ['incineroar', 'A', '8'], ['rotom-heat', 'B', '6'], ['typhlosion-hisui', 'C', '4']]

function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS)
  XLSX.utils.book_append_sheet(wb, ws, 'Tiers')
  XLSX.writeFile(wb, 'tier_template.xlsx')
}

function ImportPanel({ pokemon, sid, onDone }: { pokemon: Pokemon[]; sid: number; onDone: () => void }) {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [applying, setApplying] = useState(false)
  const [msg, setMsg] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const nameMap = useMemo(() => {
    const map: Record<string, Pokemon> = {}
    for (const p of pokemon) {
      // Match by forme_name first (e.g. "rotom-heat", "typhlosion-hisui")
      if (p.species_forme_name) map[p.species_forme_name.toLowerCase()] = p
      // Also match by base species_name as fallback (e.g. "charizard")
      if (p.species_name) map[p.species_name.toLowerCase()] = p
    }
    return map
  }, [pokemon])

  function parseFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const parsed: ImportRow[] = raw.map(r => {
        const name = (r['name'] ?? r['Name'] ?? '').toString().trim()
        const tier = (r['tier'] ?? r['Tier'] ?? '').toString().trim()
        const pc   = (r['point_cost'] ?? r['Point Cost'] ?? '').toString().trim()
        const matched = nameMap[name.toLowerCase()] ?? null
        let warning = ''
        if (!name)                         warning = 'Missing name'
        else if (!matched)                 warning = `No Pokemon found for "${name}"`
        else if (!(VALID_TIERS as Set<string>).has(tier))   warning = `Invalid tier "${tier}" — must be one of ${TIERS.join(', ')}`
        else if (!matched.is_legal)        warning = 'Pokemon is marked illegal for this season'
        return { name, tier, point_cost: pc || null, matched, warning }
      })
      setRows(parsed)
      setMsg('')
    }
    reader.readAsArrayBuffer(file)
  }

  function handleFiles(files: FileList | null) {
    if (files?.length) parseFile(files[0])
  }

  async function applyImport() {
    const valid = rows.filter(r => !r.warning && r.matched)
    if (!valid.length) { setMsg('No valid rows to apply.'); return }
    setApplying(true); setMsg('')
    try {
      const updates = valid.map(r => ({
        species_id: r.matched!.species_id,
        tier: r.tier,
        point_cost: r.point_cost ? parseInt(r.point_cost, 10) : null,
      }))
      await axios.post(`/seasons/${sid}/pokemon/bulk-update`, { updates }, { withCredentials: true })
      setMsg(`Applied ${valid.length} updates.`)
      onDone()
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Failed to apply.')
    }
    setApplying(false)
  }

  const good = rows.filter(r => !r.warning).length
  const bad  = rows.length - good

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors"
        style={{
          borderColor: dragActive ? 'var(--color-primary)' : 'var(--color-border)',
          background: dragActive ? 'rgba(99,102,241,0.05)' : 'var(--color-surface)',
        }}
        onDragOver={e => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => fileRef.current?.click()}
      >
        <p className="font-medium" style={{ color: 'var(--color-text)' }}>Drop CSV or XLSX here, or click to browse</p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Required columns: <code>name</code>, <code>tier</code> — optional: <code>point_cost</code>
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Use PokeAPI slug format: <code>charizard</code>, <code>rotom-heat</code>, <code>typhlosion-hisui</code>, <code>charizard-mega-x</code>
        </p>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => handleFiles(e.target.files)} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={downloadTemplate}
          className="px-3 py-1.5 rounded border text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          Download template
        </button>
        {rows.length > 0 && (
          <button
            onClick={applyImport}
            disabled={applying || good === 0}
            className="px-3 py-1.5 rounded text-sm text-white"
            style={{ background: good > 0 ? 'var(--color-primary)' : '#9ca3af' }}
          >
            {applying ? 'Applying…' : `Apply ${good} valid row${good !== 1 ? 's' : ''}`}
          </button>
        )}
        {msg && (
          <span className={`text-sm self-center ${msg.startsWith('Applied') ? 'text-green-600' : 'text-red-500'}`}>
            {msg}
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <div>
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {good} ready · {bad} with issues
          </p>
          <div className="overflow-auto rounded border" style={{ borderColor: 'var(--color-border)', maxHeight: 400 }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--color-surface-alt, #f3f4f6)' }}>
                  {['Name', 'Tier', 'Pts', 'Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-xs" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--color-border)', background: r.warning ? '#fef2f2' : undefined }}>
                    <td className="px-3 py-1.5 font-medium">{r.name || <span style={{ color: '#9ca3af' }}>(empty)</span>}</td>
                    <td className="px-3 py-1.5">{r.tier || '—'}</td>
                    <td className="px-3 py-1.5">{r.point_cost ?? '—'}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.warning
                        ? <span className="text-red-500">{r.warning}</span>
                        : <span className="text-green-600">Ready</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DragTierTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [pokemon, setPokemon] = useState<Pokemon[]>([])
  const [tierConfig, setTierConfig] = useState<TierConfig>({ regular: {}, mega: {} })
  const [showMega, setShowMega] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [mode, setMode] = useState<'visual' | 'import'>('visual')
  const dragItem = useRef<Pokemon | null>(null)

  const sid = selectedSeason ?? seasonId

  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])

  function loadData(id: number) {
    setLoading(true)
    Promise.all([
      axios.get(`/seasons/${id}/pokemon`),
      axios.get(`/seasons/${id}/tier-config`),
    ]).then(([pkRes, cfgRes]) => {
      setPokemon(pkRes.data.filter((p: Pokemon) => p.is_legal))
      setTierConfig(cfgRes.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { if (sid) loadData(sid) }, [sid])

  const costForTier = (tier: string): number | null => {
    const cfg = showMega ? tierConfig.mega : tierConfig.regular
    return cfg[tier] ?? null
  }

  const filtered = pokemon.filter(p => {
    if (!!p.is_mega !== showMega) return false
    if (search && !p.species_name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const byTier: Record<string, Pokemon[]> = {}
  for (const tier of [...TIERS, 'Untiered']) byTier[tier] = []
  for (const p of filtered) {
    const t = p.tier && TIERS.includes(p.tier as any) ? p.tier : 'Untiered'
    byTier[t].push(p)
  }

  const handleDrop = async (targetTier: string) => {
    const p = dragItem.current
    if (!p) return
    dragItem.current = null
    setDragOver(null)
    const newTier = targetTier === 'Untiered' ? null : targetTier
    const newCost = newTier ? costForTier(newTier) : null
    setPokemon(prev => prev.map(pk => pk.id === p.id ? { ...pk, tier: newTier, point_cost: newCost } : pk))
    setSaving(true); setMsg('')
    try {
      await axios.post(`/seasons/${sid}/pokemon/bulk-update`, {
        updates: [{ species_id: p.species_id, tier: newTier, point_cost: newCost }],
      }, { withCredentials: true })
      setMsg(`${p.species_name} → ${newTier ?? 'Untiered'}`)
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Failed to save')
      loadData(sid!)
    }
    setSaving(false)
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Visual Tier List</h2>
          <div className="flex border rounded overflow-hidden text-xs" style={{ borderColor: 'var(--color-border)' }}>
            <button onClick={() => setMode('visual')} className="px-3 py-1.5"
              style={{ background: mode === 'visual' ? 'var(--color-primary)' : 'var(--color-surface)', color: mode === 'visual' ? 'white' : 'inherit' }}>
              Visual
            </button>
            <button onClick={() => setMode('import')} className="px-3 py-1.5"
              style={{ background: mode === 'import' ? 'var(--color-primary)' : 'var(--color-surface)', color: mode === 'import' ? 'white' : 'inherit' }}>
              CSV / XLSX Import
            </button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <select value={sid ?? ''} onChange={e => setSelectedSeason(+e.target.value)}
            className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {mode === 'visual' && (
            <>
              <div className="flex border rounded overflow-hidden text-sm" style={{ borderColor: 'var(--color-border)' }}>
                <button onClick={() => setShowMega(false)} className="px-3 py-1"
                  style={{ background: !showMega ? 'var(--color-primary)' : 'var(--color-surface)', color: !showMega ? 'white' : 'inherit' }}>Regular</button>
                <button onClick={() => setShowMega(true)} className="px-3 py-1"
                  style={{ background: showMega ? 'var(--color-primary)' : 'var(--color-surface)', color: showMega ? 'white' : 'inherit' }}>Mega</button>
              </div>
              <input
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-36"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              />
            </>
          )}
        </div>
      </div>

      {mode === 'import' && sid ? (
        <ImportPanel pokemon={pokemon} sid={sid} onDone={() => { loadData(sid); setMode('visual') }} />
      ) : (
        <>
          {msg && (
            <p className={`text-sm ${msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') ? 'text-red-500' : 'text-green-600'}`}>
              {saving ? 'Saving…' : msg}
            </p>
          )}
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Drag Pokemon sprites into tier rows. Point costs auto-fill from Tier Pricing settings.
          </p>

          <div className="space-y-1">
            {[...TIERS, 'Untiered'].map(tier => {
              const color = TIER_COLORS[tier]
              const cost = tier !== 'Untiered' ? costForTier(tier) : null
              return (
                <div
                  key={tier}
                  className="flex border-2 rounded-lg overflow-hidden min-h-[72px]"
                  style={{ borderColor: color.border }}
                  onDragOver={e => { e.preventDefault(); setDragOver(tier) }}
                  onDragLeave={() => setDragOver(t => t === tier ? null : t)}
                  onDrop={() => handleDrop(tier)}
                >
                  <div
                    className="flex flex-col items-center justify-center select-none shrink-0"
                    style={{ width: 64, background: color.label }}
                  >
                    <span className="font-bold text-white text-base leading-none">{tier}</span>
                    {cost !== null && (
                      <span className="text-white text-xs opacity-90 mt-0.5">{cost}pt</span>
                    )}
                  </div>
                  <div
                    className="flex flex-wrap gap-1 p-2 flex-1 transition-colors"
                    style={{ background: dragOver === tier ? color.border + '44' : color.bg, alignContent: 'flex-start' }}
                  >
                    {byTier[tier].map(p => (
                      <PokemonCard key={p.id} pokemon={p} onDragStart={() => { dragItem.current = p }} />
                    ))}
                    {byTier[tier].length === 0 && dragOver !== tier && (
                      <span className="text-xs self-center px-2" style={{ color: '#94a3b8' }}>Drop here</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function PokemonCard({ pokemon: p, onDragStart }: { pokemon: Pokemon; onDragStart: () => void }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex flex-col items-center cursor-grab active:cursor-grabbing select-none"
      style={{ width: 60 }}
      title={`${p.species_name}${p.point_cost !== null ? ` · ${p.point_cost}pt` : ''}`}
    >
      {p.species_sprite_url ? (
        <img src={p.species_sprite_url} alt={p.species_name} style={{ width: 48, height: 48, objectFit: 'contain' }} draggable={false} />
      ) : (
        <div style={{ width: 48, height: 48, background: '#e5e7eb', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#6b7280' }}>?</div>
      )}
      <span style={{ fontSize: 9, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word', width: '100%', color: 'var(--color-text)' }}>
        {p.species_name}
      </span>
    </div>
  )
}

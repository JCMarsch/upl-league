import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../hooks/useActiveSeason'

interface Pokemon {
  id: number
  species_id: number
  tier: string | null
  point_cost: number | null
  is_legal: boolean
  drafted_by_team_id: number | null
  species_name: string
  species_sprite_url: string | null
  species_artwork_url: string | null
  species_shiny_sprite_url: string | null
  species_shiny_artwork_url: string | null
  species_type1: string
  species_type2: string | null
  is_mega: boolean | null
  is_regional_variant: boolean | null
  format_legality: Record<string, boolean> | null
  pokedex_number: number | null
  hp: number | null
  atk: number | null
  def_: number | null
  spatk: number | null
  spdef: number | null
  spe: number | null
  total: number | null
}

type SpriteMode = '2d' | '2d-shiny' | '3d' | '3d-shiny'
type SortCol = 'name' | 'dex' | 'type1' | 'type2' | 'tier' | 'cost' | 'hp' | 'atk' | 'def' | 'spatk' | 'spdef' | 'spe' | 'total'

const TYPE_COLORS: Record<string, string> = {
  Fire: 'bg-red-500', Water: 'bg-blue-500', Grass: 'bg-green-500',
  Electric: 'bg-yellow-400', Psychic: 'bg-pink-500', Ice: 'bg-cyan-400',
  Dragon: 'bg-purple-600', Dark: 'bg-gray-700', Fighting: 'bg-red-700',
  Normal: 'bg-gray-400', Flying: 'bg-sky-400', Poison: 'bg-purple-500',
  Ground: 'bg-yellow-600', Rock: 'bg-yellow-700', Bug: 'bg-lime-500',
  Ghost: 'bg-indigo-600', Steel: 'bg-gray-500', Fairy: 'bg-pink-400',
}

const SPRITE_MODES: { value: SpriteMode; label: string }[] = [
  { value: '2d', label: '2D' },
  { value: '2d-shiny', label: '2D Shiny' },
  { value: '3d', label: '3D' },
  { value: '3d-shiny', label: '3D Shiny' },
]

const TypeBadge = ({ type }: { type: string }) => (
  <span className={`px-2 py-0.5 rounded text-white text-xs font-medium ${TYPE_COLORS[type] || 'bg-gray-400'}`}>
    {type}
  </span>
)

function getSpriteUrl(p: Pokemon, mode: SpriteMode): string | null {
  switch (mode) {
    case '2d': return p.species_sprite_url
    case '2d-shiny': return p.species_shiny_sprite_url || p.species_sprite_url
    case '3d': return p.species_artwork_url || p.species_sprite_url
    case '3d-shiny': return p.species_shiny_artwork_url || p.species_artwork_url || p.species_sprite_url
  }
}

function statBar(val: number | null) {
  if (val === null) return null
  const pct = Math.min(100, Math.round((val / 255) * 100))
  const color = val >= 120 ? 'bg-green-500' : val >= 80 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-1 min-w-[56px]">
      <span className="w-7 text-right text-xs tabular-nums">{val}</span>
      <div className="flex-1 h-1.5 rounded bg-gray-200 overflow-hidden" style={{ minWidth: 28 }}>
        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function PokemonDatabasePage() {
  const { seasonId, loading: seasonLoading } = useActiveSeason()
  const [pokemon, setPokemon] = useState<Pokemon[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState('')
  const [legalOnly, setLegalOnly] = useState(true)
  const [spriteMode, setSpriteMode] = useState<SpriteMode>(() =>
    (localStorage.getItem('spriteMode') as SpriteMode) || '2d'
  )
  const [sortCol, setSortCol] = useState<SortCol>('dex')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    if (seasonLoading) return
    if (!seasonId) { setLoading(false); return }
    setLoading(true)
    axios.get(`/seasons/${seasonId}/pokemon`)
      .then((r) => setPokemon(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [seasonId, seasonLoading])

  const handleSpriteMode = (mode: SpriteMode) => {
    setSpriteMode(mode)
    localStorage.setItem('spriteMode', mode)
  }

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'name' ? 'asc' : 'desc')
    }
  }

  const filtered = useMemo(() => {
    let list = pokemon.filter((p) => {
      if (legalOnly && !p.is_legal) return false
      if (search && !p.species_name?.toLowerCase().includes(search.toLowerCase())) return false
      if (tierFilter && p.tier !== tierFilter) return false
      if (typeFilter && p.species_type1 !== typeFilter && p.species_type2 !== typeFilter) return false
      if (availabilityFilter === 'available' && p.drafted_by_team_id) return false
      if (availabilityFilter === 'drafted' && !p.drafted_by_team_id) return false
      return true
    })

    list = [...list].sort((a, b) => {
      let av: number | string, bv: number | string
      switch (sortCol) {
        case 'name':  av = a.species_name ?? ''; bv = b.species_name ?? ''; break
        case 'dex':   av = a.pokedex_number ?? 9999; bv = b.pokedex_number ?? 9999; break
        case 'type1': av = a.species_type1 ?? ''; bv = b.species_type1 ?? ''; break
        case 'type2': av = a.species_type2 ?? ''; bv = b.species_type2 ?? ''; break
        case 'tier':  av = a.tier ?? 'ZZZ'; bv = b.tier ?? 'ZZZ'; break
        case 'cost':  av = a.point_cost ?? -1; bv = b.point_cost ?? -1; break
        case 'hp':    av = a.hp ?? -1; bv = b.hp ?? -1; break
        case 'atk':   av = a.atk ?? -1; bv = b.atk ?? -1; break
        case 'def':   av = a.def_ ?? -1; bv = b.def_ ?? -1; break
        case 'spatk': av = a.spatk ?? -1; bv = b.spatk ?? -1; break
        case 'spdef': av = a.spdef ?? -1; bv = b.spdef ?? -1; break
        case 'spe':   av = a.spe ?? -1; bv = b.spe ?? -1; break
        case 'total': av = a.total ?? -1; bv = b.total ?? -1; break
        default:      av = a.species_name ?? ''; bv = b.species_name ?? ''
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [pokemon, search, tierFilter, typeFilter, availabilityFilter, legalOnly, sortCol, sortDir])

  const tiers = [...new Set(pokemon.map((p) => p.tier).filter(Boolean))].sort() as string[]
  const types = [...new Set(pokemon.flatMap((p) => [p.species_type1, p.species_type2].filter(Boolean)))].sort() as string[]

  const SortHeader = ({ col, label, title }: { col: SortCol; label: string; title?: string }) => (
    <th
      className="px-2 py-2 cursor-pointer select-none hover:bg-gray-200 whitespace-nowrap text-right"
      onClick={() => handleSort(col)}
      title={title}
    >
      {label}{sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const SortHeaderLeft = ({ col, label }: { col: SortCol; label: string }) => (
    <th
      className="px-2 py-2 cursor-pointer select-none hover:bg-gray-200 whitespace-nowrap text-left"
      onClick={() => handleSort(col)}
    >
      {label}{sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div className="max-w-full mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Pokemon Database</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder="Search Pokemon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        />
        <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="">All Tiers</option>
          {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="">All Types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={availabilityFilter} onChange={(e) => setAvailabilityFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="">All</option>
          <option value="available">Available</option>
          <option value="drafted">Drafted</option>
        </select>
        <button
          onClick={() => setLegalOnly(v => !v)}
          className="px-3 py-2 rounded-md text-sm font-medium border"
          style={{
            borderColor: legalOnly ? '#22c55e' : 'var(--color-border)',
            color: legalOnly ? '#16a34a' : 'var(--color-text-muted)',
            background: legalOnly ? '#f0fdf4' : 'var(--color-surface)',
          }}
        >
          {legalOnly ? 'Legal Only' : 'All Pokemon'}
        </button>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{filtered.length} shown</span>
      </div>

      {/* Sprite mode toggle */}
      <div className="flex gap-1 mb-4">
        <span className="text-xs self-center mr-1" style={{ color: 'var(--color-text-muted)' }}>Sprites:</span>
        {SPRITE_MODES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleSpriteMode(value)}
            className="px-2 py-1 rounded text-xs border"
            style={{
              borderColor: spriteMode === value ? 'var(--color-primary)' : 'var(--color-border)',
              background: spriteMode === value ? 'var(--color-primary)' : 'var(--color-surface)',
              color: spriteMode === value ? 'white' : 'inherit',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {!seasonId && !seasonLoading && (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>No active season found. Create one in the Admin panel.</div>
      )}
      {(loading || seasonLoading) ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-gray-100 text-left text-xs">
                <th className="px-2 py-2 w-10">Sprite</th>
                <SortHeader col="dex" label="#" title="Pokédex number" />
                <SortHeaderLeft col="name" label="Name" />
                <SortHeaderLeft col="type1" label="Type 1" />
                <SortHeaderLeft col="type2" label="Type 2" />
                <SortHeader col="tier" label="Tier" />
                <SortHeader col="cost" label="Cost" />
                <SortHeader col="hp" label="HP" />
                <SortHeader col="atk" label="Atk" />
                <SortHeader col="def" label="Def" />
                <SortHeader col="spatk" label="SpA" title="Special Attack" />
                <SortHeader col="spdef" label="SpD" title="Special Defense" />
                <SortHeader col="spe" label="Spe" />
                <SortHeader col="total" label="BST" title="Base Stat Total" />
                <th className="px-2 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const spriteUrl = getSpriteUrl(p, spriteMode)
                const isDrafted = !!p.drafted_by_team_id
                return (
                  <tr key={p.id} className="border-t hover:bg-gray-50" style={{ opacity: isDrafted ? 0.6 : 1 }}>
                    <td className="px-2 py-1">
                      {spriteUrl ? (
                        <img src={spriteUrl} alt={p.species_name} className="w-9 h-9" style={{ objectFit: 'contain' }} />
                      ) : (
                        <div className="w-9 h-9 bg-gray-200 rounded" />
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-400 text-xs">
                      {p.pokedex_number != null ? `#${String(p.pokedex_number).padStart(3, '0')}` : '—'}
                    </td>
                    <td className="px-2 py-1 font-medium whitespace-nowrap">{p.species_name}</td>
                    <td className="px-2 py-1">
                      {p.species_type1 && <TypeBadge type={p.species_type1} />}
                    </td>
                    <td className="px-2 py-1">
                      {p.species_type2 && <TypeBadge type={p.species_type2} />}
                    </td>
                    <td className="px-2 py-1 text-right">{p.tier || '—'}</td>
                    <td className="px-2 py-1 text-right">{p.point_cost ?? '—'}</td>
                    <td className="px-2 py-1">{statBar(p.hp)}</td>
                    <td className="px-2 py-1">{statBar(p.atk)}</td>
                    <td className="px-2 py-1">{statBar(p.def_)}</td>
                    <td className="px-2 py-1">{statBar(p.spatk)}</td>
                    <td className="px-2 py-1">{statBar(p.spdef)}</td>
                    <td className="px-2 py-1">{statBar(p.spe)}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-semibold text-xs">
                      {p.total ?? '—'}
                    </td>
                    <td className="px-2 py-1">
                      {isDrafted
                        ? <span className="text-gray-400 text-xs">Drafted</span>
                        : <span className="text-green-600 text-xs">Available</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-gray-500 py-8">No Pokemon match your filters.</div>
          )}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'

interface Pokemon {
  id: number
  species_id: number
  tier: string | null
  point_cost: number | null
  is_legal: boolean
  drafted_by_team_id: number | null
  species_name: string
  species_sprite_url: string | null
  species_type1: string
  species_type2: string | null
}

const TYPE_COLORS: Record<string, string> = {
  Fire: 'bg-red-500', Water: 'bg-blue-500', Grass: 'bg-green-500',
  Electric: 'bg-yellow-400', Psychic: 'bg-pink-500', Ice: 'bg-cyan-400',
  Dragon: 'bg-purple-600', Dark: 'bg-gray-700', Fighting: 'bg-red-700',
  Normal: 'bg-gray-400', Flying: 'bg-sky-400', Poison: 'bg-purple-500',
  Ground: 'bg-yellow-600', Rock: 'bg-yellow-700', Bug: 'bg-lime-500',
  Ghost: 'bg-indigo-600', Steel: 'bg-gray-500', Fairy: 'bg-pink-400',
}

const TypeBadge = ({ type }: { type: string }) => (
  <span className={`px-2 py-0.5 rounded text-white text-xs font-medium ${TYPE_COLORS[type] || 'bg-gray-400'}`}>
    {type}
  </span>
)

export default function PokemonDatabasePage() {
  const [pokemon, setPokemon] = useState<Pokemon[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState('')

  useEffect(() => {
    axios.get('/seasons/1/pokemon')
      .then((r) => setPokemon(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return pokemon.filter((p) => {
      if (search && !p.species_name?.toLowerCase().includes(search.toLowerCase())) return false
      if (tierFilter && p.tier !== tierFilter) return false
      if (typeFilter && p.species_type1 !== typeFilter && p.species_type2 !== typeFilter) return false
      if (availabilityFilter === 'available' && p.drafted_by_team_id) return false
      if (availabilityFilter === 'drafted' && !p.drafted_by_team_id) return false
      return true
    })
  }, [pokemon, search, tierFilter, typeFilter, availabilityFilter])

  const tiers = [...new Set(pokemon.map((p) => p.tier).filter(Boolean))] as string[]
  const types = [...new Set(pokemon.flatMap((p) => [p.species_type1, p.species_type2].filter(Boolean)))] as string[]

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Pokemon Database</h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search Pokemon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">All Tiers</option>
          {tiers.sort().map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">All Types</option>
          {types.sort().map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={availabilityFilter} onChange={(e) => setAvailabilityFilter(e.target.value)} className="border border-gray-300 rounded-md px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="available">Available</option>
          <option value="drafted">Drafted</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="px-3 py-2">Sprite</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type(s)</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Cost</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-1">
                    {p.species_sprite_url ? (
                      <img src={p.species_sprite_url} alt={p.species_name} className="w-10 h-10" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-200 rounded" />
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{p.species_name}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <TypeBadge type={p.species_type1} />
                      {p.species_type2 && <TypeBadge type={p.species_type2} />}
                    </div>
                  </td>
                  <td className="px-3 py-2">{p.tier || '-'}</td>
                  <td className="px-3 py-2">{p.point_cost ?? '-'}</td>
                  <td className="px-3 py-2">
                    {p.drafted_by_team_id ? (
                      <span className="text-gray-500">Drafted</span>
                    ) : (
                      <span className="text-green-600">Available</span>
                    )}
                  </td>
                </tr>
              ))}
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

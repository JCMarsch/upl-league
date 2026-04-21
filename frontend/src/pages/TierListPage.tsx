import { useState, useEffect } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../hooks/useActiveSeason'

interface Pokemon {
  id: number
  species_id: number
  tier: string
  point_cost: number
  is_legal: boolean
  drafted_by_team_id: number | null
  species_name: string
  species_sprite_url: string
  species_type1: string
  species_type2: string | null
}

const TIER_COLORS: Record<string, string> = {
  S: 'bg-red-100 border-red-400',
  A: 'bg-orange-100 border-orange-400',
  B: 'bg-yellow-100 border-yellow-400',
  C: 'bg-green-100 border-green-400',
  D: 'bg-blue-100 border-blue-400',
  Free: 'bg-gray-100 border-gray-400',
}

const TIER_HEADER_COLORS: Record<string, string> = {
  S: 'bg-red-400',
  A: 'bg-orange-400',
  B: 'bg-yellow-400',
  C: 'bg-green-400',
  D: 'bg-blue-400',
  Free: 'bg-gray-400',
}

export default function TierListPage() {
  const { seasonId, loading: seasonLoading } = useActiveSeason()
  const [pokemon, setPokemon] = useState<Pokemon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (seasonLoading) return
    if (!seasonId) { setLoading(false); return }
    setLoading(true)
    axios.get(`/seasons/${seasonId}/pokemon`)
      .then((r) => setPokemon(r.data.filter((p: Pokemon) => p.is_legal)))
      .catch(() => setError('Failed to load Pokemon'))
      .finally(() => setLoading(false))
  }, [seasonId, seasonLoading])

  const byTier = pokemon.reduce<Record<string, Pokemon[]>>((acc, p) => {
    const tier = p.tier || 'Untiered'
    acc[tier] = acc[tier] || []
    acc[tier].push(p)
    return acc
  }, {})

  const tierOrder = ['S', 'A', 'B', 'C', 'D', 'Free', 'Untiered']
  const sortedTiers = tierOrder.filter((t) => byTier[t]?.length > 0)

  if (loading) return <div className="p-8 text-center text-gray-500">Loading tier list...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Tier List</h1>

      {sortedTiers.map((tier) => (
        <div key={tier} className={`mb-4 border-2 rounded-lg overflow-hidden ${TIER_COLORS[tier] || 'bg-gray-100 border-gray-400'}`}>
          <div className={`px-4 py-2 font-bold text-white text-lg ${TIER_HEADER_COLORS[tier] || 'bg-gray-400'}`}>
            {tier}
          </div>
          <div className="flex flex-wrap gap-3 p-3">
            {byTier[tier].map((p) => (
              <div key={p.id} className="flex flex-col items-center w-20">
                <div className="relative">
                  {p.species_sprite_url ? (
                    <img src={p.species_sprite_url} alt={p.species_name} className="w-16 h-16 object-contain" />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">?</div>
                  )}
                  {p.drafted_by_team_id && (
                    <span className="absolute -top-1 -right-1 bg-gray-700 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">✓</span>
                  )}
                </div>
                <span className="text-xs text-center mt-1 truncate w-full text-center">{p.species_name}</span>
                <span className="text-xs font-bold text-gray-600">{p.point_cost}pt</span>
                {p.drafted_by_team_id && <span className="text-xs text-gray-400">Drafted</span>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {sortedTiers.length === 0 && (
        <div className="text-center text-gray-500 py-12">No Pokemon tiers have been set yet.</div>
      )}
    </div>
  )
}

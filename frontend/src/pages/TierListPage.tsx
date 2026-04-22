import { useState, useEffect } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../hooks/useActiveSeason'
import { TIERS, TIER_COLORS } from '../constants/tiers'

interface Pokemon {
  id: number
  species_id: number
  tier: string
  point_cost: number | null
  is_legal: boolean
  is_mega: boolean
  drafted_by_team_id: number | null
  species_name: string
  species_sprite_url: string | null
}

interface TierConfig {
  regular: Record<string, number | null>
  mega: Record<string, number | null>
}

export default function TierListPage() {
  const { seasonId, seasons, setSeasonId, loading: seasonLoading } = useActiveSeason()
  const [pokemon, setPokemon] = useState<Pokemon[]>([])
  const [tierConfig, setTierConfig] = useState<TierConfig>({ regular: {}, mega: {} })
  const [showMega, setShowMega] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (seasonLoading || !seasonId) { if (!seasonLoading) setLoading(false); return }
    setLoading(true)
    Promise.all([
      axios.get(`/seasons/${seasonId}/pokemon`),
      axios.get(`/seasons/${seasonId}/tier-config`),
    ])
      .then(([pkRes, cfgRes]) => {
        setPokemon(pkRes.data.filter((p: Pokemon) => p.is_legal && p.tier))
        setTierConfig(cfgRes.data)
      })
      .catch(() => setError('Failed to load tier list'))
      .finally(() => setLoading(false))
  }, [seasonId, seasonLoading])

  const filtered = pokemon.filter(p => !!p.is_mega === showMega)

  const byTier: Record<string, Pokemon[]> = {}
  for (const tier of TIERS) byTier[tier] = []
  for (const p of filtered) {
    if (byTier[p.tier]) byTier[p.tier].push(p)
  }

  const activeTiers = TIERS.filter(t => byTier[t]?.length > 0)

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading tier list...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Tier List</h1>
        <div className="flex gap-2 flex-wrap items-center">
          {seasons.length > 1 && (
            <select value={seasonId ?? ''} onChange={e => setSeasonId(+e.target.value)}
              className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="flex border rounded overflow-hidden text-sm" style={{ borderColor: 'var(--color-border)' }}>
            <button
              onClick={() => setShowMega(false)}
              className="px-3 py-1.5"
              style={{ background: !showMega ? 'var(--color-primary)' : 'var(--color-surface)', color: !showMega ? 'white' : 'inherit' }}
            >Regular</button>
            <button
              onClick={() => setShowMega(true)}
              className="px-3 py-1.5"
              style={{ background: showMega ? 'var(--color-primary)' : 'var(--color-surface)', color: showMega ? 'white' : 'inherit' }}
            >Mega</button>
          </div>
        </div>
      </div>

      {activeTiers.length === 0 ? (
        <div className="p-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
          No {showMega ? 'mega ' : ''}Pokemon tiers set yet.
        </div>
      ) : (
        <div className="flex gap-1 overflow-x-auto pb-2">
          {activeTiers.map(tier => {
            const color = TIER_COLORS[tier]
            const cost = showMega ? tierConfig.mega[tier] : tierConfig.regular[tier]
            return (
              <div key={tier} className="flex flex-col flex-1 min-w-[80px] rounded-lg border-2 overflow-hidden" style={{ borderColor: color.border }}>
                {/* Tier label header */}
                <div className="flex flex-col items-center justify-center py-2 select-none shrink-0" style={{ background: color.label }}>
                  <span className="font-bold text-white text-lg leading-none">{tier}</span>
                  {cost !== null && cost !== undefined && (
                    <span className="text-white text-xs opacity-90 mt-0.5">{cost}pt</span>
                  )}
                </div>
                {/* Pokemon stacked vertically */}
                <div className="flex flex-col items-center gap-1 p-1 flex-1" style={{ background: color.bg }}>
                  {byTier[tier].map(p => (
                    <div key={p.id} className="flex flex-col items-center w-full">
                      <div className="relative">
                        {p.species_sprite_url ? (
                          <img src={p.species_sprite_url} alt={p.species_name} style={{ width: 56, height: 56, objectFit: 'contain' }} />
                        ) : (
                          <div style={{ width: 56, height: 56, background: '#e5e7eb', borderRadius: 4 }} />
                        )}
                        {p.drafted_by_team_id && (
                          <span className="absolute -top-1 -right-1 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold"
                            style={{ background: '#374151', fontSize: 9 }}>✓</span>
                        )}
                      </div>
                      <span style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.2, color: '#374151', wordBreak: 'break-word', width: '100%' }}>{p.species_name}</span>
                      {p.point_cost !== null && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280' }}>{p.point_cost}pt</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../hooks/useActiveSeason'
import { TIERS, TIER_COLORS } from '../constants/tiers'

interface Pokemon {
  id: number
  species_id: number
  tier: string | null
  point_cost: number | null
  is_legal: boolean
  is_mega: boolean
  drafted_by_team_id: number | null
  species_name: string
  species_sprite_url: string | null
  species_type1: string | null
  species_type2: string | null
}

interface TierConfig {
  regular: Record<string, number | null>
  mega: Record<string, number | null>
}

type AvailFilter = 'all' | 'available' | 'drafted'

function PokemonCell({ p }: { p: Pokemon }) {
  return (
    <div className="flex flex-col items-center" style={{ width: 64 }}>
      <div className="relative">
        {p.species_sprite_url ? (
          <img
            src={p.species_sprite_url}
            alt={p.species_name}
            style={{ width: 52, height: 52, objectFit: 'contain', opacity: p.drafted_by_team_id ? 0.35 : 1 }}
          />
        ) : (
          <div style={{ width: 52, height: 52, background: '#e5e7eb', borderRadius: 4, opacity: p.drafted_by_team_id ? 0.35 : 1 }} />
        )}
        {p.drafted_by_team_id && (
          <span
            className="absolute -top-1 -right-1 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold"
            style={{ background: '#374151', fontSize: 9 }}
          >✓</span>
        )}
      </div>
      <span style={{ fontSize: 9, textAlign: 'center', lineHeight: 1.2, color: '#374151', wordBreak: 'break-word', width: '100%' }}>
        {p.species_name}
      </span>
      {p.point_cost !== null && (
        <span style={{ fontSize: 9, fontWeight: 600, color: '#6b7280' }}>{p.point_cost}pt</span>
      )}
    </div>
  )
}

export default function TierListPage() {
  const { seasonId, seasons, setSeasonId, loading: seasonLoading } = useActiveSeason()
  const [pokemon, setPokemon] = useState<Pokemon[]>([])
  const [tierConfig, setTierConfig] = useState<TierConfig>({ regular: {}, mega: {} })
  const [showMega, setShowMega] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [availFilter, setAvailFilter] = useState<AvailFilter>('all')

  useEffect(() => {
    if (seasonLoading || !seasonId) { if (!seasonLoading) setLoading(false); return }
    setLoading(true)
    Promise.all([
      axios.get(`/seasons/${seasonId}/pokemon`),
      axios.get(`/seasons/${seasonId}/tier-config`),
    ])
      .then(([pkRes, cfgRes]) => {
        setPokemon(pkRes.data.filter((p: Pokemon) => p.is_legal))
        setTierConfig(cfgRes.data)
      })
      .catch(() => setError('Failed to load tier list'))
      .finally(() => setLoading(false))
  }, [seasonId, seasonLoading])

  const allTypes = useMemo(() => {
    const types = new Set<string>()
    for (const p of pokemon) {
      if (p.species_type1) types.add(p.species_type1)
      if (p.species_type2) types.add(p.species_type2)
    }
    return [...types].sort()
  }, [pokemon])

  const filtered = useMemo(() => pokemon.filter(p => {
    if (!!p.is_mega !== showMega) return false
    if (search && !p.species_name.toLowerCase().includes(search.toLowerCase())) return false
    if (typeFilter && p.species_type1 !== typeFilter && p.species_type2 !== typeFilter) return false
    if (availFilter === 'available' && p.drafted_by_team_id) return false
    if (availFilter === 'drafted' && !p.drafted_by_team_id) return false
    return true
  }), [pokemon, showMega, search, typeFilter, availFilter])

  const byTier: Record<string, Pokemon[]> = {}
  for (const tier of TIERS) byTier[tier] = []
  for (const p of filtered) {
    if (p.tier && byTier[p.tier]) byTier[p.tier].push(p)
  }
  const untiered = filtered.filter(p => !p.tier)
  const activeTiers = TIERS.filter(t => byTier[t]?.length > 0)

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading tier list...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Tier List</h1>
        <div className="flex gap-2 flex-wrap items-center">
          {seasons.length > 1 && (
            <select
              value={seasonId ?? ''}
              onChange={e => setSeasonId(+e.target.value)}
              className="border rounded px-2 py-1 text-sm"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
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

      <div className="flex gap-2 flex-wrap">
        <input
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[160px]"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <option value="">All Types</option>
          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={availFilter}
          onChange={e => setAvailFilter(e.target.value as AvailFilter)}
          className="border rounded px-2 py-1.5 text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <option value="all">All</option>
          <option value="available">Available</option>
          <option value="drafted">Drafted</option>
        </select>
      </div>

      {untiered.length > 0 && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: TIER_COLORS['Untiered'].border }}>
          <div className="flex items-center px-3 py-1 text-xs font-semibold select-none" style={{ background: TIER_COLORS['Untiered'].label, color: 'white' }}>
            Unranked ({untiered.length})
          </div>
          <div className="flex flex-wrap gap-1 p-2" style={{ background: TIER_COLORS['Untiered'].bg }}>
            {untiered.map(p => <PokemonCell key={p.id} p={p} />)}
          </div>
        </div>
      )}

      {activeTiers.length === 0 && untiered.length === 0 ? (
        <div className="p-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
          {search || typeFilter || availFilter !== 'all'
            ? 'No Pokemon match these filters.'
            : `No ${showMega ? 'mega ' : ''}Pokemon tiers set yet.`}
        </div>
      ) : (
        <div className="space-y-1.5">
          {activeTiers.map(tier => {
            const color = TIER_COLORS[tier]
            const cost = showMega ? tierConfig.mega[tier] : tierConfig.regular[tier]
            return (
              <div key={tier} className="flex rounded-lg border overflow-hidden" style={{ borderColor: color.border }}>
                <div
                  className="flex flex-col items-center justify-center px-3 py-2 select-none shrink-0"
                  style={{ background: color.label, minWidth: 56 }}
                >
                  <span className="font-bold text-white text-xl leading-none">{tier}</span>
                  {cost !== null && cost !== undefined && (
                    <span className="text-white text-xs opacity-90 mt-0.5">{cost}pt</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 p-2 flex-1" style={{ background: color.bg }}>
                  {byTier[tier].map(p => <PokemonCell key={p.id} p={p} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

interface RosterPokemon {
  id: number
  species_name: string | null
  species_sprite_url: string | null
  species_type1: string | null
  species_type2: string | null
  tier: string | null
  point_cost: number | null
  nickname: string | null
  ability: string | null
  item: string | null
  tera_type: string | null
}

interface TeamDetail {
  id: number
  name: string
  abbreviation: string | null
  logo_url: string | null
  primary_color: string
  secondary_color: string
  points_remaining: number
  manager_id: number
  roster: RosterPokemon[]
}

const TYPE_COLORS: Record<string, string> = {
  Fire: '#EE8130', Water: '#6390F0', Grass: '#7AC74C', Electric: '#F7D02C',
  Ice: '#96D9D6', Fighting: '#C22E28', Poison: '#A33EA1', Ground: '#E2BF65',
  Flying: '#A98FF3', Psychic: '#F95587', Bug: '#A6B91A', Rock: '#B6A136',
  Ghost: '#735797', Dragon: '#6F35FC', Dark: '#705746', Steel: '#B7B7CE',
  Fairy: '#D685AD', Normal: '#A8A77A',
}

export default function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const [team, setTeam] = useState<TeamDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!teamId) return
    axios.get(`/teams/${teamId}`)
      .then(r => setTeam(r.data))
      .catch(() => setError('Team not found'))
      .finally(() => setLoading(false))
  }, [teamId])

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  if (error || !team) return <div className="p-8 text-center text-red-500">{error || 'Team not found'}</div>

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-6 flex items-center gap-6" style={{ background: team.primary_color + '22', border: `2px solid ${team.primary_color}` }}>
        {team.logo_url && <img src={team.logo_url} alt={team.name} className="w-20 h-20 object-contain rounded-lg" />}
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--color-text)' }}>{team.name}</h1>
          {team.abbreviation && <p className="text-lg font-mono mt-1" style={{ color: 'var(--color-text-muted)' }}>{team.abbreviation}</p>}
          <p className="mt-2 text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Points remaining: <span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>{team.points_remaining}</span>
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Roster ({team.roster.length} Pokemon)</h2>
        {team.roster.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No Pokemon drafted yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {team.roster.map(p => (
              <div key={p.id} className="rounded-lg p-3 flex flex-col items-center gap-1 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                {p.species_sprite_url ? (
                  <img src={p.species_sprite_url} alt={p.species_name ?? ''} className="w-16 h-16 object-contain" />
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl" style={{ background: 'var(--color-border)' }}>?</div>
                )}
                <p className="text-sm font-medium leading-tight">{p.nickname || p.species_name}</p>
                {p.nickname && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{p.species_name}</p>}
                <div className="flex gap-1 flex-wrap justify-center">
                  {p.species_type1 && (
                    <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: TYPE_COLORS[p.species_type1] ?? '#888' }}>{p.species_type1}</span>
                  )}
                  {p.species_type2 && (
                    <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: TYPE_COLORS[p.species_type2] ?? '#888' }}>{p.species_type2}</span>
                  )}
                </div>
                {p.tier && <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'var(--color-border)' }}>Tier {p.tier}</span>}
                {p.point_cost != null && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{p.point_cost} pts</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

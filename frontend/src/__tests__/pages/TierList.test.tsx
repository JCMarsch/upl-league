import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test/utils'
import TierListPage from '../../pages/TierListPage'
import { server } from '../../test/setup'
import { http, HttpResponse } from 'msw'

const mockPokemon = [
  { id: 1, species_id: 1, tier: 'S', point_cost: 20, is_legal: true, drafted_by_team_id: null, species_name: 'Pikachu', species_sprite_url: null, species_type1: 'Electric', species_type2: null },
  { id: 2, species_id: 2, tier: 'A', point_cost: 15, is_legal: true, drafted_by_team_id: 3, species_name: 'Charizard', species_sprite_url: null, species_type1: 'Fire', species_type2: 'Flying' },
  { id: 3, species_id: 3, tier: 'B', point_cost: 10, is_legal: true, drafted_by_team_id: null, species_name: 'Dragonite', species_sprite_url: null, species_type1: 'Dragon', species_type2: 'Flying' },
]

beforeEach(() => {
  server.use(
    http.get('/seasons/:seasonId/pokemon', () => HttpResponse.json(mockPokemon))
  )
})

describe('TierListPage', () => {
  it('renders all tiers', async () => {
    render(<TierListPage />)
    await waitFor(() => {
      expect(screen.getByText('S')).toBeInTheDocument()
      expect(screen.getByText('A')).toBeInTheDocument()
      expect(screen.getByText('B')).toBeInTheDocument()
    })
  })

  it('shows pokemon names in correct tiers', async () => {
    render(<TierListPage />)
    await waitFor(() => {
      expect(screen.getByText('Pikachu')).toBeInTheDocument()
      expect(screen.getByText('Charizard')).toBeInTheDocument()
      expect(screen.getByText('Dragonite')).toBeInTheDocument()
    })
  })

  it('shows drafted indicator for drafted pokemon', async () => {
    render(<TierListPage />)
    await waitFor(() => {
      // Charizard is drafted
      expect(screen.getByText('Drafted')).toBeInTheDocument()
    })
  })

  it('shows empty state when no pokemon', async () => {
    server.use(
      http.get('/seasons/:seasonId/pokemon', () => HttpResponse.json([]))
    )
    render(<TierListPage />)
    await waitFor(() => {
      expect(screen.getByText(/no pokemon tiers/i)).toBeInTheDocument()
    })
  })
})

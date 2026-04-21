import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '../../test/utils'
import PokemonDatabasePage from '../../pages/PokemonDatabasePage'
import { server } from '../../test/setup'
import { http, HttpResponse } from 'msw'

const mockPokemon = [
  { id: 1, species_id: 1, tier: 'S', point_cost: 20, is_legal: true, drafted_by_team_id: null, species_name: 'Pikachu', species_sprite_url: null, species_type1: 'Electric', species_type2: null },
  { id: 2, species_id: 2, tier: 'A', point_cost: 15, is_legal: true, drafted_by_team_id: 3, species_name: 'Charizard', species_sprite_url: null, species_type1: 'Fire', species_type2: 'Flying' },
  { id: 3, species_id: 3, tier: 'B', point_cost: 10, is_legal: true, drafted_by_team_id: null, species_name: 'Dragonite', species_sprite_url: null, species_type1: 'Dragon', species_type2: 'Flying' },
]

beforeEach(() => {
  server.use(
    http.get('/seasons/1/pokemon', () => HttpResponse.json(mockPokemon))
  )
})

describe('PokemonDatabasePage', () => {
  it('renders all pokemon in table', async () => {
    render(<PokemonDatabasePage />)
    await waitFor(() => {
      expect(screen.getByText('Pikachu')).toBeInTheDocument()
      expect(screen.getByText('Charizard')).toBeInTheDocument()
      expect(screen.getByText('Dragonite')).toBeInTheDocument()
    })
  })

  it('filters by name search', async () => {
    render(<PokemonDatabasePage />)
    await waitFor(() => expect(screen.getByText('Pikachu')).toBeInTheDocument())

    const searchInput = screen.getByPlaceholderText('Search Pokemon...')
    fireEvent.change(searchInput, { target: { value: 'pika' } })

    expect(screen.getByText('Pikachu')).toBeInTheDocument()
    expect(screen.queryByText('Charizard')).not.toBeInTheDocument()
  })

  it('shows drafted status for drafted pokemon', async () => {
    render(<PokemonDatabasePage />)
    await waitFor(() => {
      // Charizard is drafted (drafted_by_team_id: 3)
      expect(screen.getByText('Drafted')).toBeInTheDocument()
      // Others are available
      expect(screen.getAllByText('Available').length).toBeGreaterThan(0)
    })
  })

  it('shows no results when search has no match', async () => {
    render(<PokemonDatabasePage />)
    await waitFor(() => expect(screen.getByText('Pikachu')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('Search Pokemon...'), {
      target: { value: 'zzznomatch' },
    })
    expect(screen.getByText(/no pokemon match/i)).toBeInTheDocument()
  })
})

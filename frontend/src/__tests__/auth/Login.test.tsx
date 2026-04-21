import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test/utils'
import LoginPage from '../../pages/LoginPage'
import ProtectedRoute from '../../components/ProtectedRoute'
import { useAuthStore } from '../../store/authStore'
import { server } from '../../test/setup'
import { http, HttpResponse } from 'msw'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(() => {
  mockNavigate.mockReset()
  useAuthStore.setState({ user: null, loading: false })
})

describe('LoginPage', () => {
  it('renders login form', () => {
    render(<LoginPage />)
    expect(screen.getByText('UPL Login')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument()
  })

  it('shows error on invalid credentials', async () => {
    server.use(
      http.post('/auth/login', () => HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 }))
    )
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'bad' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: /login/i }))
    await waitFor(() => {
      expect(screen.getByText('Invalid username or password')).toBeInTheDocument()
    })
  })

  it('redirects to home on successful login', async () => {
    server.use(
      http.post('/auth/login', () =>
        HttpResponse.json({ message: 'ok', user: { id: 1, username: 'admin', roles: 'admin' } })
      )
    )
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'admin123' } })
    fireEvent.click(screen.getByRole('button', { name: /login/i }))
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('disables submit button while loading', async () => {
    let resolve: () => void
    const promise = new Promise<void>((r) => { resolve = r })
    server.use(
      http.post('/auth/login', async () => {
        await promise
        return HttpResponse.json({ user: { id: 1, username: 'admin', roles: 'admin' } })
      })
    )
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /login/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled()
    })
    resolve!()
  })
})

describe('ProtectedRoute', () => {
  it('redirects to login when not authenticated', () => {
    useAuthStore.setState({ user: null })
    render(
      <ProtectedRoute>
        <div>Secret Content</div>
      </ProtectedRoute>
    )
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument()
  })

  it('renders when authenticated', () => {
    useAuthStore.setState({ user: { id: 1, username: 'admin', roles: 'admin' } })
    render(
      <ProtectedRoute>
        <div>Secret Content</div>
      </ProtectedRoute>
    )
    expect(screen.getByText('Secret Content')).toBeInTheDocument()
  })

  it('shows 403 for wrong role', () => {
    useAuthStore.setState({ user: { id: 1, username: 'user', roles: 'manager' } })
    render(
      <ProtectedRoute requiredRole="superadmin">
        <div>Admin Only</div>
      </ProtectedRoute>
    )
    expect(screen.queryByText('Admin Only')).not.toBeInTheDocument()
    expect(screen.getByText(/403/)).toBeInTheDocument()
  })
})

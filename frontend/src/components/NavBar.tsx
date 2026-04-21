import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

export default function NavBar() {
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const [menuOpen, setMenuOpen] = useState(false)

  const themes = ['light', 'dark', 'pokemon'] as const

  return (
    <nav
      className="w-full px-4 py-3 flex items-center justify-between border-b"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <Link to="/" className="font-bold text-xl" style={{ color: 'var(--color-primary)' }}>
        UPL
      </Link>

      {/* Desktop nav */}
      <div className="hidden md:flex items-center gap-6 text-sm">
        <Link to="/standings" className="hover:underline">Standings</Link>
        <Link to="/tier-list" className="hover:underline">Tier List</Link>
        <Link to="/pokemon" className="hover:underline">Pokemon</Link>
        <Link to="/schedule" className="hover:underline">Schedule</Link>
        {user && (
          <>
            <Link to="/draft" className="hover:underline">Draft</Link>
            <Link to="/transactions" className="hover:underline">Transactions</Link>
          </>
        )}
        {user && (user.roles.includes('admin') || user.roles.includes('superadmin')) && (
          <Link to="/admin" className="hover:underline font-semibold text-red-600">Admin</Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as typeof theme)}
          className="text-xs border rounded px-2 py-1"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="pokemon">Pokemon</option>
        </select>

        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-sm hidden md:inline" style={{ color: 'var(--color-text-muted)' }}>
              {user.username}
            </span>
            <button
              onClick={logout}
              className="text-xs px-3 py-1.5 rounded border hover:bg-gray-100"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Logout
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="text-xs px-3 py-1.5 rounded text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            Login
          </Link>
        )}

        {/* Mobile hamburger */}
        <button
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="absolute top-14 left-0 right-0 z-50 border-b md:hidden flex flex-col gap-2 px-4 py-3"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <Link to="/standings" onClick={() => setMenuOpen(false)}>Standings</Link>
          <Link to="/tier-list" onClick={() => setMenuOpen(false)}>Tier List</Link>
          <Link to="/pokemon" onClick={() => setMenuOpen(false)}>Pokemon</Link>
          <Link to="/schedule" onClick={() => setMenuOpen(false)}>Schedule</Link>
          {user && <Link to="/draft" onClick={() => setMenuOpen(false)}>Draft</Link>}
        </div>
      )}
    </nav>
  )
}

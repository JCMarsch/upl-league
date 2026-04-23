import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import logo from '../assets/APL_Logo.png'

export default function NavBar() {
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const navigate = useNavigate()

  const themes = ['light', 'dark', 'pokemon'] as const

  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    const fetchCount = () => {
      axios.get('/notifications/unread-count', { withCredentials: true })
        .then(r => setUnreadCount(r.data.count))
        .catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60000)
    return () => clearInterval(interval)
  }, [user])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav
      className="w-full px-4 py-3 flex items-center justify-between border-b relative"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <Link to="/" className="flex items-center gap-2">
        <img src={logo} alt="UPL Logo" className="h-8 w-auto" />
      </Link>

      {/* Desktop nav */}
      <div className="hidden md:flex items-center gap-6 text-sm">
        <Link to="/standings" className="hover:underline">Standings</Link>
        <Link to="/teams" className="hover:underline">Teams</Link>
        <Link to="/tier-list" className="hover:underline">Tier List</Link>
        <Link to="/pokemon" className="hover:underline">Pokemon</Link>
        <Link to="/schedule" className="hover:underline">Schedule</Link>
        <Link to="/draft-board" className="hover:underline">Draft Board</Link>
        <Link to="/analytics" className="hover:underline">Analytics</Link>
        <Link to="/history" className="hover:underline">History</Link>
        {user && (
          <>
            <Link to="/draft" className="hover:underline">Draft</Link>
            <Link to="/transactions" className="hover:underline">Transactions</Link>
          </>
        )}
        {user && (user.roles.includes('admin') || user.roles.includes('superadmin')) && (
          <Link to="/admin" className="hover:underline font-semibold" style={{ color: '#ef4444' }}>Admin</Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as typeof themes[number])}
          className="text-xs border rounded px-2 py-1"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="pokemon">Pokemon</option>
        </select>

        {user ? (
          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <Link to="/notifications" className="relative p-1.5 rounded hover:opacity-70" title="Notifications">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 text-xs text-white rounded-full w-4 h-4 flex items-center justify-center font-bold"
                  style={{ background: 'var(--color-primary)', fontSize: '10px' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>

            <Link
              to={`/managers/${user.id}`}
              className="text-sm hidden md:inline hover:underline"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {user.username}
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded border hover:opacity-70"
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="absolute top-full left-0 right-0 z-50 border-b md:hidden flex flex-col gap-1 px-4 py-3"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          {[
            { to: '/standings', label: 'Standings' },
            { to: '/teams', label: 'Teams' },
            { to: '/tier-list', label: 'Tier List' },
            { to: '/pokemon', label: 'Pokemon' },
            { to: '/schedule', label: 'Schedule' },
            { to: '/history', label: 'History' },
            ...(user ? [
              { to: '/draft', label: 'Draft' },
              { to: '/transactions', label: 'Transactions' },
              { to: '/notifications', label: `Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
              { to: `/managers/${user.id}`, label: 'My Career' },
            ] : []),
            ...(user && (user.roles.includes('admin') || user.roles.includes('superadmin')) ? [
              { to: '/admin', label: 'Admin' },
            ] : []),
          ].map(link => (
            <Link
              key={link.to}
              to={link.to}
              className="py-2 px-1 border-b last:border-0 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}

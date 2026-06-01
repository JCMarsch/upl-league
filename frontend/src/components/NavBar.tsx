import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import logo from '../assets/APL_Logo.png'

const THEME_ICONS: Record<string, string> = {
  light: '☀',
  dark: '◐',
  pokemon: '⚡',
}

export default function NavBar() {
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()

  const isAdmin = user && (user.roles.includes('admin') || user.roles.includes('superadmin'))
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    const fetch = () => axios.get('/notifications/unread-count', { withCredentials: true })
      .then(r => setUnreadCount(r.data.count)).catch(() => {})
    fetch()
    const t = setInterval(fetch, 60000)
    return () => clearInterval(t)
  }, [user])

  const handleLogout = () => { logout(); navigate('/login') }

  const navLinks = [
    { to: '/standings', label: 'Standings' },
    { to: '/teams', label: 'Teams' },
    { to: '/tier-list', label: 'Tiers' },
    { to: '/pokemon', label: 'Pokédex' },
    { to: '/schedule', label: 'Schedule' },
    { to: '/playoffs', label: 'Playoffs' },
    { to: '/draft-board', label: 'Draft Board' },
    { to: '/analytics', label: 'Analytics' },
    { to: '/awards', label: 'Awards' },
    { to: '/history', label: 'History' },
    ...(user ? [
      { to: '/draft', label: 'Draft' },
      { to: '/transactions', label: 'Trades' },
    ] : []),
  ]

  return (
    <nav
      className="w-full sticky top-0 z-50"
      style={{
        background: 'var(--color-surface)',
        borderBottom: '2px solid var(--color-primary)',
      }}
    >
      <div className="max-w-[1600px] mx-auto px-4 flex items-stretch h-14">

        {/* Logo */}
        <Link to="/" className="flex items-center flex-shrink-0 pr-4">
          <img src={logo} alt="UPL" className="h-8 w-auto" />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-stretch flex-1 min-w-0">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center px-2.5 font-display font-bold transition-colors border-b-2 -mb-[2px] whitespace-nowrap hover:opacity-100"
              style={{
                fontSize: '11px',
                letterSpacing: '0.08em',
                color: isActive(to) ? 'var(--color-primary)' : 'var(--color-text-muted)',
                borderBottomColor: isActive(to) ? 'var(--color-primary)' : 'transparent',
                opacity: isActive(to) ? 1 : undefined,
              }}
            >
              {label.toUpperCase()}
            </Link>
          ))}
          {isAdmin && (
            <Link
              to="/admin"
              className="flex items-center px-2.5 font-display font-bold transition-colors border-b-2 -mb-[2px] whitespace-nowrap"
              style={{
                fontSize: '11px',
                letterSpacing: '0.08em',
                color: '#ef4444',
                borderBottomColor: isActive('/admin') ? '#ef4444' : 'transparent',
              }}
            >
              ADMIN
            </Link>
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 ml-auto pl-4">

          {/* Theme switcher */}
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
            {(['light', 'dark', 'pokemon'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                title={t.charAt(0).toUpperCase() + t.slice(1)}
                className="px-2 py-1 font-display font-bold transition-colors"
                style={{
                  fontSize: '13px',
                  background: theme === t ? 'var(--color-primary)' : 'transparent',
                  color: theme === t ? '#fff' : 'var(--color-text-muted)',
                }}
              >
                {THEME_ICONS[t]}
              </button>
            ))}
          </div>

          {/* Notifications */}
          {user && (
            <Link
              to="/notifications"
              className="relative p-1.5 rounded transition-colors hover:opacity-70"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 text-white rounded-full w-4 h-4 flex items-center justify-center font-display font-bold"
                  style={{ background: 'var(--color-primary)', fontSize: '10px' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          )}

          {/* User / Login */}
          {user ? (
            <div className="hidden md:flex items-center gap-2">
              <Link
                to={`/managers/${user.id}`}
                className="font-display font-bold transition-colors hover:opacity-70"
                style={{ fontSize: '11px', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}
              >
                {user.username.toUpperCase()}
              </Link>
              <button
                onClick={handleLogout}
                className="font-display font-bold rounded border transition-colors hover:opacity-70"
                style={{ fontSize: '10px', letterSpacing: '0.1em', padding: '4px 10px', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)', background: 'transparent' }}
              >
                LOGOUT
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="font-display font-bold rounded text-white transition-colors hover:opacity-90"
              style={{ fontSize: '11px', letterSpacing: '0.1em', padding: '6px 14px', background: 'var(--color-primary)' }}
            >
              LOGIN
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-1"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ color: 'var(--color-text-muted)' }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="md:hidden border-t"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          {[
            ...navLinks,
            ...(isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
            ...(user ? [
              { to: '/notifications', label: `Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
              { to: `/managers/${user.id}`, label: 'My Career' },
            ] : []),
          ].map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center px-4 py-3 border-b font-display font-bold transition-colors"
              style={{
                fontSize: '12px',
                letterSpacing: '0.08em',
                borderColor: 'var(--color-border)',
                color: isActive(to) ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
              onClick={() => setMenuOpen(false)}
            >
              {label.toUpperCase()}
            </Link>
          ))}
          {user && (
            <button
              onClick={() => { handleLogout(); setMenuOpen(false) }}
              className="w-full flex items-center px-4 py-3 font-display font-bold"
              style={{ fontSize: '12px', letterSpacing: '0.08em', color: '#ef4444' }}
            >
              LOGOUT
            </button>
          )}
        </div>
      )}
    </nav>
  )
}

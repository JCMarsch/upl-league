import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import TierListPage from './pages/TierListPage'
import PokemonDatabasePage from './pages/PokemonDatabasePage'
import AdminPage from './pages/AdminPage'
import StandingsPage from './pages/StandingsPage'
import SchedulePage from './pages/SchedulePage'
import MatchPage from './pages/MatchPage'
import TransactionsPage from './pages/TransactionsPage'
import TeamPage from './pages/TeamPage'
import DraftPage from './pages/DraftPage'
import HistoryPage from './pages/HistoryPage'
import SeasonHistoryPage from './pages/SeasonHistoryPage'
import ManagerPage from './pages/ManagerPage'
import NotificationsPage from './pages/NotificationsPage'
import TeamsListPage from './pages/TeamsListPage'
import DraftBoardPage from './pages/DraftBoardPage'
import AnalyticsPage from './pages/AnalyticsPage'
import AwardsPage from './pages/AwardsPage'
import { useAuthStore } from './store/authStore'
import { useEffect } from 'react'
import logo from './assets/APL_Logo.png'

function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center">
        <img src={logo} alt="UPL Logo" style={{ height: 180, objectFit: 'contain', margin: '0 auto 16px' }} />
        <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Pokemon Draft League</p>
      </div>
    </div>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', color: 'var(--color-text)' }}>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}

function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public auth pages (no layout) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Public pages */}
        <Route path="/" element={<Layout><Home /></Layout>} />
        <Route path="/standings" element={<Layout><StandingsPage /></Layout>} />
        <Route path="/tier-list" element={<Layout><TierListPage /></Layout>} />
        <Route path="/pokemon" element={<Layout><PokemonDatabasePage /></Layout>} />
        <Route path="/schedule" element={<Layout><SchedulePage /></Layout>} />
        <Route path="/matches/:matchId" element={<Layout><MatchPage /></Layout>} />
        <Route path="/teams/:teamId" element={<Layout><TeamPage /></Layout>} />
        <Route path="/teams" element={<Layout><TeamsListPage /></Layout>} />
        <Route path="/history" element={<Layout><HistoryPage /></Layout>} />
        <Route path="/history/:seasonId" element={<Layout><SeasonHistoryPage /></Layout>} />
        <Route path="/managers/:userId" element={<Layout><ManagerPage /></Layout>} />
        <Route path="/draft-board" element={<Layout><DraftBoardPage /></Layout>} />
        <Route path="/analytics" element={<Layout><AnalyticsPage /></Layout>} />
        <Route path="/awards" element={<Layout><AwardsPage /></Layout>} />

        {/* Protected pages (login required) */}
        <Route path="/draft" element={<ProtectedRoute><Layout><DraftPage /></Layout></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><Layout><TransactionsPage /></Layout></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Layout><NotificationsPage /></Layout></ProtectedRoute>} />

        {/* Admin only */}
        <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><Layout><AdminPage /></Layout></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

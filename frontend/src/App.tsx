import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import TierListPage from './pages/TierListPage'
import PokemonDatabasePage from './pages/PokemonDatabasePage'
import AdminPage from './pages/AdminPage'
import RegisterPage from './pages/RegisterPage'
import { useAuthStore } from './store/authStore'
import { useEffect } from 'react'

function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-3" style={{ color: 'var(--color-primary)' }}>UPL</h1>
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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<Layout><Home /></Layout>} />
        <Route path="/tier-list" element={<Layout><TierListPage /></Layout>} />
        <Route path="/pokemon" element={<Layout><PokemonDatabasePage /></Layout>} />
        <Route path="/standings" element={<Layout><div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Standings coming soon</div></Layout>} />
        <Route path="/schedule" element={<Layout><div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Schedule coming soon</div></Layout>} />
        <Route path="/draft" element={<ProtectedRoute><Layout><div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Draft room coming soon</div></Layout></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><Layout><div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Transactions coming soon</div></Layout></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><Layout><AdminPage /></Layout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

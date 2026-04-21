import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface Props {
  children: React.ReactNode
  requiredRole?: string
}

export default function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, loading } = useAuthStore()

  if (loading) return null

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && !user.roles.split(',').includes(requiredRole)) {
    return <div className="p-8 text-center text-red-600">Access denied (403 Forbidden)</div>
  }

  return <>{children}</>
}

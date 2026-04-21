import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

interface Notification {
  id: number
  type: string
  title: string
  body: string | null
  read: boolean
  link: string | null
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifs = () => {
    axios.get('/notifications', { withCredentials: true })
      .then(r => setNotifications(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchNotifs() }, [])

  const markRead = async (id: number) => {
    await axios.post(`/notifications/${id}/read`, {}, { withCredentials: true })
    setNotifications(n => n.map(notif => notif.id === id ? { ...notif, read: true } : notif))
  }

  const markAllRead = async () => {
    await axios.post('/notifications/read-all', {}, { withCredentials: true })
    setNotifications(n => n.map(notif => ({ ...notif, read: true })))
  }

  const typeIcon: Record<string, string> = {
    draft: '🎯', trade: '🔄', waiver: '📋', match: '⚔️', season: '🏆', default: '🔔',
  }

  const unread = notifications.filter(n => !n.read).length

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications {unread > 0 && <span className="text-sm font-normal ml-2 px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary)', color: 'white' }}>{unread}</span>}</h1>
        {unread > 0 && (
          <button onClick={markAllRead} className="text-sm px-3 py-1 border rounded" style={{ borderColor: 'var(--color-border)' }}>
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>No notifications yet.</div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div
              key={n.id}
              className="flex items-start gap-4 p-4 rounded-lg border cursor-pointer"
              onClick={() => !n.read && markRead(n.id)}
              style={{
                borderColor: 'var(--color-border)',
                background: n.read ? 'var(--color-surface)' : 'var(--color-primary)11',
                borderLeftColor: n.read ? 'var(--color-border)' : 'var(--color-primary)',
                borderLeftWidth: n.read ? '1px' : '3px',
              }}
            >
              <div className="text-2xl flex-shrink-0">{typeIcon[n.type] ?? typeIcon.default}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{n.title}</div>
                {n.body && <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{n.body}</div>}
                {n.link && (
                  <Link to={n.link} className="text-xs mt-1 inline-block hover:underline" style={{ color: 'var(--color-primary)' }}>
                    View →
                  </Link>
                )}
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: 'var(--color-primary)' }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

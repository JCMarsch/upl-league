import { useState, useEffect } from 'react'
import axios from 'axios'

interface UserRow {
  id: number
  username: string
  email: string | null
  roles: string
  created_at: string | null
}

const inp = {
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  padding: '6px 10px',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: '0.85rem',
  width: '100%',
} as const

export default function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRoles, setEditRoles] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', email: '', roles: 'viewer' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    axios.get('/admin/users', { withCredentials: true })
      .then(r => setUsers(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const startEdit = (u: UserRow) => {
    setEditingId(u.id)
    setEditRoles(u.roles)
    setErr('')
  }

  const saveRoles = async (id: number) => {
    setSaving(true); setErr('')
    try {
      await axios.patch(`/admin/users/${id}`, { roles: editRoles }, { withCredentials: true })
      setEditingId(null)
      load()
    } catch (e: any) { setErr(e.response?.data?.detail ?? 'Failed') }
    finally { setSaving(false) }
  }

  const createUser = async () => {
    if (!form.username || !form.password) { setErr('Username and password required'); return }
    setSaving(true); setErr('')
    try {
      await axios.post('/auth/register', form, { withCredentials: true })
      setCreating(false)
      setForm({ username: '', password: '', email: '', roles: 'viewer' })
      load()
    } catch (e: any) { setErr(e.response?.data?.detail ?? 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <button
          onClick={() => { setCreating(v => !v); setErr('') }}
          className="px-4 py-1.5 rounded text-sm text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          {creating ? 'Cancel' : '+ Create User'}
        </button>
      </div>

      {creating && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <div className="text-sm font-medium">New User</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Username *</div>
              <input style={inp} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="username" />
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Password *</div>
              <input style={inp} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="password" />
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Email (optional)</div>
              <input style={inp} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Role</div>
              <select style={inp} value={form.roles} onChange={e => setForm(f => ({ ...f, roles: e.target.value }))}>
                <option value="viewer">viewer</option>
                <option value="admin">admin</option>
                <option value="admin,superadmin">admin + superadmin</option>
              </select>
            </div>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <button
            onClick={createUser}
            disabled={saving}
            className="px-4 py-2 rounded text-sm text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Username</th>
                <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Email</th>
                <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Role</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderTop: i > 0 ? '1px solid var(--color-border)' : undefined }}>
                  <td className="px-4 py-2 font-medium">{u.username}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{u.email || '—'}</td>
                  <td className="px-4 py-2">
                    {editingId === u.id ? (
                      <select
                        value={editRoles}
                        onChange={e => setEditRoles(e.target.value)}
                        style={{ ...inp, width: 'auto' }}
                      >
                        <option value="viewer">viewer</option>
                        <option value="admin">admin</option>
                        <option value="admin,superadmin">admin + superadmin</option>
                      </select>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded" style={{
                        background: u.roles.includes('admin') ? '#fee2e2' : 'var(--color-bg)',
                        color: u.roles.includes('admin') ? '#ef4444' : 'var(--color-text-muted)',
                        border: '1px solid var(--color-border)',
                      }}>
                        {u.roles}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editingId === u.id ? (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => saveRoles(u.id)} disabled={saving} className="text-xs text-green-600 hover:underline disabled:opacity-40">Save</button>
                        <button onClick={() => { setEditingId(null); setErr('') }} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(u)} className="text-xs hover:underline" style={{ color: 'var(--color-text-muted)' }}>
                        Edit role
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!err && editingId && <p className="px-4 py-2 text-xs text-red-500">{err}</p>}
        </div>
      )}
    </div>
  )
}

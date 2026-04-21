import { useState, useEffect } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../../hooks/useActiveSeason'

interface Trade {
  id: number; status: string; proposed_at: string; approved_at: string | null
  proposed_by_team_id: number; proposed_to_team_id: number; notes: string | null
}

export default function TradesTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [msg, setMsg] = useState('')

  const sid = selectedSeason ?? seasonId
  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])
  useEffect(() => {
    if (!sid) return
    axios.get(`/seasons/${sid}/trades`).then(r => setTrades(r.data))
  }, [sid])

  const load = () => { if (sid) axios.get(`/seasons/${sid}/trades`).then(r => setTrades(r.data)) }

  const forceExecute = async (id: number) => {
    try {
      await axios.post(`/admin/trades/${id}/force-execute`, {}, { withCredentials: true })
      setMsg(`Trade #${id} executed.`)
      load()
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
  }

  const cancel = async (id: number) => {
    try {
      await axios.post(`/trades/${id}/cancel`, {}, { withCredentials: true })
      load()
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
  }

  const daysUntilExecute = (approved_at: string) => {
    const approved = new Date(approved_at)
    const executeAt = new Date(approved.getTime() + 2 * 24 * 60 * 60 * 1000)
    const diff = executeAt.getTime() - Date.now()
    if (diff <= 0) return 'Ready to execute'
    const hours = Math.ceil(diff / (1000 * 60 * 60))
    return `Auto-executes in ~${hours}h`
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    voting: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    denied: 'bg-red-100 text-red-700',
    executed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-gray-100 text-gray-600',
  }

  const active = trades.filter(t => ['pending', 'voting', 'approved'].includes(t.status))
  const historical = trades.filter(t => ['denied', 'executed', 'cancelled'].includes(t.status))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Trades</h2>
        <select value={sid ?? ''} onChange={e => setSelectedSeason(+e.target.value)}
          className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {msg && <p className="text-sm text-green-600">{msg}</p>}

      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Approved trades auto-execute 2 days after approval. Use "Force Execute" to execute immediately, or "Cancel" to void.
      </p>

      <div>
        <h3 className="font-medium mb-2">Active ({active.length})</h3>
        {active.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No active trades.</p>
        ) : (
          <div className="space-y-2">
            {active.map(t => (
              <div key={t.id} className="border rounded p-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">Trade #{t.id}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${statusColor[t.status]}`}>{t.status}</span>
                    {t.status === 'approved' && t.approved_at && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{daysUntilExecute(t.approved_at)}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {t.status === 'approved' && (
                      <button onClick={() => forceExecute(t.id)} className="px-3 py-1 text-xs rounded bg-green-600 text-white">Force Execute</button>
                    )}
                    {['pending', 'voting'].includes(t.status) && (
                      <button onClick={() => cancel(t.id)} className="px-3 py-1 text-xs rounded bg-red-600 text-white">Cancel</button>
                    )}
                  </div>
                </div>
                {t.notes && <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{t.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {historical.length > 0 && (
        <div>
          <h3 className="font-medium mb-2">History ({historical.length})</h3>
          <div className="space-y-2">
            {historical.map(t => (
              <div key={t.id} className="border rounded p-3 flex items-center justify-between opacity-60" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-sm">Trade #{t.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${statusColor[t.status]}`}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

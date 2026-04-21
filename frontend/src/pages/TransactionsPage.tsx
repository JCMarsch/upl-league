import { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useActiveSeason } from '../hooks/useActiveSeason'

interface Waiver {
  id: number
  team_id: number
  add_species_id: number
  drop_species_id: number | null
  priority_at_time: number | null
  status: string
  submitted_at: string
}

interface Trade {
  id: number
  proposed_by_team_id: number
  proposed_to_team_id: number
  status: string
  proposed_at: string
}

interface Team { id: number; name: string }
interface WaiverOrder { team_id: number; position: number }

type Tab = 'log' | 'waivers' | 'trades'

export default function TransactionsPage() {
  const { user } = useAuthStore()
  const { seasonId } = useActiveSeason()
  const [tab, setTab] = useState<Tab>('log')
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [waiverOrder, setWaiverOrder] = useState<WaiverOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Waiver form
  const [addSpeciesId, setAddSpeciesId] = useState('')
  const [dropSpeciesId, setDropSpeciesId] = useState('')
  const [submittingWaiver, setSubmittingWaiver] = useState(false)

  // Trade form
  const [tradeToTeam, setTradeToTeam] = useState('')
  const [giveIds, setGiveIds] = useState('')
  const [receiveIds, setReceiveIds] = useState('')
  const [tradeNotes, setTradeNotes] = useState('')
  const [submittingTrade, setSubmittingTrade] = useState(false)

  const isLoggedIn = !!user

  useEffect(() => {
    if (!seasonId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      axios.get(`/seasons/${seasonId}/waivers`),
      axios.get(`/seasons/${seasonId}/trades`),
      axios.get(`/seasons/${seasonId}/teams`),
      axios.get(`/seasons/${seasonId}/waiver-order`),
    ]).then(([w, t, teams, order]) => {
      setWaivers(w.data)
      setTrades(t.data)
      const m: Record<number, Team> = {}
      for (const team of teams.data) m[team.id] = team
      setTeams(m)
      setWaiverOrder(order.data)
    }).finally(() => setLoading(false))
  }, [seasonId])

  const teamName = (id: number) => teams[id]?.name ?? `Team ${id}`

  const submitWaiver = async () => {
    if (!addSpeciesId) { setMsg('Enter a Pokemon species ID to add'); return }
    setSubmittingWaiver(true); setMsg('')
    try {
      await axios.post(`/seasons/${seasonId}/waivers`, {
        add_species_id: +addSpeciesId,
        drop_species_id: dropSpeciesId ? +dropSpeciesId : undefined,
      }, { withCredentials: true })
      setMsg('Waiver claim submitted!')
      setAddSpeciesId(''); setDropSpeciesId('')
      const r = await axios.get(`/seasons/${seasonId}/waivers`)
      setWaivers(r.data)
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Failed to submit waiver')
    } finally { setSubmittingWaiver(false) }
  }

  const submitTrade = async () => {
    setSubmittingTrade(true); setMsg('')
    try {
      const give = giveIds.split(',').map(s => +s.trim()).filter(Boolean)
      const receive = receiveIds.split(',').map(s => +s.trim()).filter(Boolean)
      await axios.post(`/seasons/${seasonId}/trades`, {
        proposed_to_team_id: +tradeToTeam,
        give_species_ids: give,
        receive_species_ids: receive,
        notes: tradeNotes || undefined,
      }, { withCredentials: true })
      setMsg('Trade proposed!')
      setTradeToTeam(''); setGiveIds(''); setReceiveIds(''); setTradeNotes('')
      const r = await axios.get(`/seasons/${seasonId}/trades`)
      setTrades(r.data)
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Failed to propose trade')
    } finally { setSubmittingTrade(false) }
  }

  const voteOnTrade = async (tradeId: number, vote: 'approve' | 'deny') => {
    try {
      await axios.post(`/trades/${tradeId}/vote`, { vote }, { withCredentials: true })
      setMsg(`Vote cast: ${vote}`)
      const r = await axios.get(`/seasons/${seasonId}/trades`)
      setTrades(r.data)
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Failed to vote')
    }
  }

  const cancelTrade = async (tradeId: number) => {
    if (!confirm('Cancel this trade?')) return
    try {
      await axios.post(`/trades/${tradeId}/cancel`, {}, { withCredentials: true })
      setMsg('Trade cancelled')
      const r = await axios.get(`/seasons/${seasonId}/trades`)
      setTrades(r.data)
    } catch (e: any) {
      setMsg(e.response?.data?.detail || 'Failed to cancel')
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = { pending: '#f59e0b', approved: '#22c55e', denied: '#ef4444', cancelled: '#888', voting: '#3b82f6', processed: '#22c55e' }
    const c = colors[status] ?? '#888'
    return <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: c + '22', color: c, border: `1px solid ${c}` }}>{status}</span>
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'log', label: 'Transaction Log' },
    { id: 'waivers', label: 'Waivers' },
    { id: 'trades', label: 'Trade Centre' },
  ]

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Transactions</h1>

      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setMsg('') }}
            className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
            style={{
              borderBottomColor: tab === t.id ? 'var(--color-primary)' : 'transparent',
              color: tab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && <p className={`text-sm ${msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}

      {/* Transaction Log */}
      {tab === 'log' && (
        <div className="space-y-3">
          <h2 className="font-semibold">All Transactions</h2>
          {[...waivers.filter(w => w.status !== 'pending'), ...trades.filter(t => ['approved', 'denied', 'cancelled'].includes(t.status))].length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No completed transactions yet.</p>
          ) : (
            <div className="space-y-2">
              {waivers.filter(w => ['approved', 'denied', 'processed'].includes(w.status)).map(w => (
                <div key={`w-${w.id}`} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                  <div>
                    <span className="font-medium">{teamName(w.team_id)}</span>
                    <span className="text-sm ml-2" style={{ color: 'var(--color-text-muted)' }}>
                      waiver claim — add #{w.add_species_id}{w.drop_species_id ? `, drop #${w.drop_species_id}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(w.status)}
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(w.submitted_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              {trades.filter(t => ['approved', 'denied', 'cancelled'].includes(t.status)).map(t => (
                <div key={`t-${t.id}`} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                  <div>
                    <span className="font-medium">{teamName(t.proposed_by_team_id)}</span>
                    <span className="text-sm mx-2" style={{ color: 'var(--color-text-muted)' }}>traded with</span>
                    <span className="font-medium">{teamName(t.proposed_to_team_id)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(t.status)}
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(t.proposed_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Waivers */}
      {tab === 'waivers' && (
        <div className="space-y-6">
          {waiverOrder.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Current Waiver Order</h3>
              <div className="flex gap-2 flex-wrap">
                {waiverOrder.map((o, i) => (
                  <div key={o.team_id} className="text-sm px-3 py-1 rounded-full" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <span className="font-mono text-xs mr-1" style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span>
                    {teamName(o.team_id)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoggedIn && (
            <div className="border rounded-lg p-5 space-y-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold">Submit Waiver Claim</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1">Add Pokemon (species ID)</label>
                  <input value={addSpeciesId} onChange={e => setAddSpeciesId(e.target.value)} type="number"
                    className="w-full border rounded px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1">Drop Pokemon (species ID, optional)</label>
                  <input value={dropSpeciesId} onChange={e => setDropSpeciesId(e.target.value)} type="number"
                    className="w-full border rounded px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
                </div>
              </div>
              <button onClick={submitWaiver} disabled={submittingWaiver} className="px-4 py-2 rounded text-white text-sm disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
                {submittingWaiver ? 'Submitting...' : 'Submit Claim'}
              </button>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-2">Pending Waivers</h3>
            {waivers.filter(w => w.status === 'pending').length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No pending waivers.</p>
            ) : (
              <div className="space-y-2">
                {waivers.filter(w => w.status === 'pending').sort((a, b) => (a.priority_at_time ?? 999) - (b.priority_at_time ?? 999)).map(w => (
                  <div key={w.id} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                    <div className="text-sm">
                      <span className="font-medium">{teamName(w.team_id)}</span>
                      <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>Priority #{w.priority_at_time ?? '?'}</span>
                      <span className="ml-2">Add: #{w.add_species_id}</span>
                      {w.drop_species_id && <span className="ml-2">Drop: #{w.drop_species_id}</span>}
                    </div>
                    {statusBadge(w.status)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trade Centre */}
      {tab === 'trades' && (
        <div className="space-y-6">
          {isLoggedIn && (
            <div className="border rounded-lg p-5 space-y-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold">Propose Trade</h3>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs mb-1">Trade With (Team)</label>
                  <select value={tradeToTeam} onChange={e => setTradeToTeam(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
                    <option value="">Select team...</option>
                    {Object.values(teams).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1">Pokemon You Give (comma-separated species IDs)</label>
                  <input value={giveIds} onChange={e => setGiveIds(e.target.value)} placeholder="e.g. 25, 149"
                    className="w-full border rounded px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1">Pokemon You Receive (comma-separated species IDs)</label>
                  <input value={receiveIds} onChange={e => setReceiveIds(e.target.value)} placeholder="e.g. 6, 248"
                    className="w-full border rounded px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1">Notes (optional)</label>
                  <input value={tradeNotes} onChange={e => setTradeNotes(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }} />
                </div>
              </div>
              <button onClick={submitTrade} disabled={submittingTrade} className="px-4 py-2 rounded text-white text-sm disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
                {submittingTrade ? 'Proposing...' : 'Propose Trade'}
              </button>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-2">Active Trades</h3>
            {trades.filter(t => ['pending', 'voting'].includes(t.status)).length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No active trades.</p>
            ) : (
              <div className="space-y-3">
                {trades.filter(t => ['pending', 'voting'].includes(t.status)).map(t => (
                  <div key={t.id} className="border rounded-lg p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-medium">{teamName(t.proposed_by_team_id)}</span>
                        <span className="mx-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>↔</span>
                        <span className="font-medium">{teamName(t.proposed_to_team_id)}</span>
                        <span className="ml-3">{statusBadge(t.status)}</span>
                      </div>
                      {isLoggedIn && (
                        <div className="flex gap-2">
                          <button onClick={() => voteOnTrade(t.id, 'approve')} className="text-xs px-3 py-1 rounded" style={{ background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e' }}>Approve</button>
                          <button onClick={() => voteOnTrade(t.id, 'deny')} className="text-xs px-3 py-1 rounded" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef4444' }}>Deny</button>
                          <button onClick={() => cancelTrade(t.id)} className="text-xs px-3 py-1 rounded border" style={{ borderColor: 'var(--color-border)' }}>Cancel</button>
                        </div>
                      )}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Proposed {new Date(t.proposed_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

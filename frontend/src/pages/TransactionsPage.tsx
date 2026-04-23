import { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useActiveSeason } from '../hooks/useActiveSeason'

// ── Types ────────────────────────────────────────────────────────────────────

interface FeedEntry {
  type: 'waiver' | 'trade'
  date: string | null
  week_number?: number
  // waiver
  team_id?: number
  team_name?: string
  team_abbreviation?: string
  add_species_name?: string
  drop_species_name?: string
  // trade
  team_a_id?: number
  team_a_name?: string
  team_a_abbreviation?: string
  team_b_id?: number
  team_b_name?: string
  team_b_abbreviation?: string
  assets?: { from_team_id: number; to_team_id: number; species_name: string | null }[]
}

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
  notes?: string
}

interface Team { id: number; name: string; abbreviation: string | null }
interface WaiverOrder { team_id: number; position: number }

interface SeasonPokemon {
  id: number
  species_id: number
  species_name: string | null
  tier: string | null
  drafted_by_team_id: number | null
}

type Tab = 'log' | 'waivers' | 'trades'

// ── PokemonSearch ─────────────────────────────────────────────────────────────

function PokemonSearch({
  seasonPokemon,
  value,
  onSelect,
  placeholder,
  filterAvailable,
}: {
  seasonPokemon: SeasonPokemon[]
  value: { speciesId: number; name: string } | null
  onSelect: (entry: { speciesId: number; name: string } | null) => void
  placeholder?: string
  filterAvailable?: boolean
}) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value?.name ?? '')
  }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return seasonPokemon
      .filter(sp => {
        if (filterAvailable && sp.drafted_by_team_id !== null) return false
        return (sp.species_name ?? '').toLowerCase().includes(q)
      })
      .slice(0, 12)
  }, [query, seasonPokemon, filterAvailable])

  const inputStyle = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '6px 10px',
    color: 'var(--color-text)',
    fontSize: '0.85rem',
    width: '100%',
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onSelect(null) }}
        onFocus={() => { if (query) setOpen(true) }}
        placeholder={placeholder ?? 'Search Pokemon…'}
        style={inputStyle}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-0.5 rounded-lg shadow-xl overflow-hidden"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', maxHeight: 240, overflowY: 'auto' }}>
          {filtered.map(sp => (
            <button key={sp.id}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 flex items-center gap-2"
              style={{ background: 'transparent', borderBottom: '1px solid var(--color-border)' }}
              onClick={() => {
                onSelect({ speciesId: sp.species_id, name: sp.species_name ?? '' })
                setQuery(sp.species_name ?? '')
                setOpen(false)
              }}>
              <span className="flex-1">{sp.species_name}</span>
              {sp.tier && (
                <span className="text-xs px-1.5 py-0.5 rounded text-white font-bold"
                  style={{ background: { S: '#f59e0b', A: '#8b5cf6', B: '#3b82f6', C: '#22c55e', D: '#ef4444' }[sp.tier] ?? '#6b7280' }}>
                  {sp.tier}
                </span>
              )}
              {sp.drafted_by_team_id && (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>drafted</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Feed Entry Row ────────────────────────────────────────────────────────────

function FeedRow({ entry }: { entry: FeedEntry }) {
  const date = entry.date ? new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

  if (entry.type === 'waiver') {
    return (
      <div className="flex items-start gap-3 py-3 px-4 rounded-lg"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <span className="text-xs mt-0.5 px-1.5 py-0.5 rounded font-medium"
          style={{ background: '#22c55e22', color: '#22c55e', whiteSpace: 'nowrap' }}>FA</span>
        <div className="flex-1 text-sm">
          <span className="font-semibold">{entry.team_abbreviation ?? entry.team_name}</span>
          {entry.add_species_name && (
            <span> added <span className="font-medium" style={{ color: 'var(--color-primary)' }}>{entry.add_species_name}</span></span>
          )}
          {entry.drop_species_name && (
            <span>, dropped <span className="font-medium" style={{ color: '#ef4444' }}>{entry.drop_species_name}</span></span>
          )}
          {entry.week_number && (
            <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>Wk {entry.week_number}</span>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{date}</span>
      </div>
    )
  }

  // Trade
  const teamA = entry.team_a_abbreviation ?? entry.team_a_name ?? ''
  const teamB = entry.team_b_abbreviation ?? entry.team_b_name ?? ''
  const aGives = (entry.assets ?? []).filter(a => a.from_team_id === entry.team_a_id).map(a => a.species_name).filter(Boolean)
  const bGives = (entry.assets ?? []).filter(a => a.from_team_id === entry.team_b_id).map(a => a.species_name).filter(Boolean)

  return (
    <div className="flex items-start gap-3 py-3 px-4 rounded-lg"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <span className="text-xs mt-0.5 px-1.5 py-0.5 rounded font-medium"
        style={{ background: '#3b82f622', color: '#3b82f6', whiteSpace: 'nowrap' }}>TRADE</span>
      <div className="flex-1 text-sm">
        <span className="font-semibold">{teamA}</span>
        {aGives.length > 0 && (
          <span> sent <span className="font-medium" style={{ color: '#ef4444' }}>{aGives.join(', ')}</span></span>
        )}
        <span className="mx-1" style={{ color: 'var(--color-text-muted)' }}>↔</span>
        <span className="font-semibold">{teamB}</span>
        {bGives.length > 0 && (
          <span> sent <span className="font-medium" style={{ color: '#22c55e' }}>{bGives.join(', ')}</span></span>
        )}
      </div>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{date}</span>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { user } = useAuthStore()
  const { seasonId } = useActiveSeason()
  const [tab, setTab] = useState<Tab>('log')
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [waiverOrder, setWaiverOrder] = useState<WaiverOrder[]>([])
  const [seasonPokemon, setSeasonPokemon] = useState<SeasonPokemon[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Waiver form (Feature 9: name-based search)
  const [addPokemon, setAddPokemon] = useState<{ speciesId: number; name: string } | null>(null)
  const [dropPokemon, setDropPokemon] = useState<{ speciesId: number; name: string } | null>(null)
  const [submittingWaiver, setSubmittingWaiver] = useState(false)

  // Trade form
  const [tradeToTeam, setTradeToTeam] = useState<number | ''>('')
  const [givePokemons, setGivePokemons] = useState<({ speciesId: number; name: string } | null)[]>([null])
  const [receivePokemons, setReceivePokemons] = useState<({ speciesId: number; name: string } | null)[]>([null])
  const [tradeNotes, setTradeNotes] = useState('')
  const [submittingTrade, setSubmittingTrade] = useState(false)

  // Filters
  const [filterType, setFilterType] = useState<'all' | 'waiver' | 'trade'>('all')

  const isLoggedIn = !!user

  const loadAll = () => {
    if (!seasonId) return
    setLoading(true)
    Promise.all([
      axios.get(`/seasons/${seasonId}/transaction-feed`),
      axios.get(`/seasons/${seasonId}/waivers`),
      axios.get(`/seasons/${seasonId}/trades`),
      axios.get(`/seasons/${seasonId}/teams`),
      axios.get(`/seasons/${seasonId}/waiver-order`),
      axios.get(`/seasons/${seasonId}/pokemon`),
    ]).then(([feedR, w, t, teamsR, order, poke]) => {
      setFeed(feedR.data)
      setWaivers(w.data)
      setTrades(t.data)
      const m: Record<number, Team> = {}
      for (const team of teamsR.data) m[team.id] = team
      setTeams(m)
      setWaiverOrder(order.data)
      setSeasonPokemon(poke.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { if (seasonId) loadAll() }, [seasonId])

  const teamName = (id: number) => teams[id]?.name ?? `Team ${id}`

  const submitWaiver = async () => {
    if (!addPokemon) { setMsg('Select a Pokemon to add'); return }
    setSubmittingWaiver(true); setMsg('')
    try {
      await axios.post(`/seasons/${seasonId}/waivers`, {
        add_species_id: addPokemon.speciesId,
        drop_species_id: dropPokemon?.speciesId ?? undefined,
      }, { withCredentials: true })
      setMsg('Waiver claim submitted!')
      setAddPokemon(null); setDropPokemon(null)
      loadAll()
    } catch (e: any) {
      setMsg(e.response?.data?.detail ?? 'Failed to submit waiver')
    } finally { setSubmittingWaiver(false) }
  }

  const submitTrade = async () => {
    const give = givePokemons.filter(Boolean).map(p => p!.speciesId)
    const receive = receivePokemons.filter(Boolean).map(p => p!.speciesId)
    if (!tradeToTeam || give.length === 0 || receive.length === 0) {
      setMsg('Select target team and Pokemon to give/receive')
      return
    }
    setSubmittingTrade(true); setMsg('')
    try {
      await axios.post(`/seasons/${seasonId}/trades`, {
        proposed_to_team_id: tradeToTeam,
        give_species_ids: give,
        receive_species_ids: receive,
        notes: tradeNotes || undefined,
      }, { withCredentials: true })
      setMsg('Trade proposed!')
      setTradeToTeam(''); setGivePokemons([null]); setReceivePokemons([null]); setTradeNotes('')
      loadAll()
    } catch (e: any) {
      setMsg(e.response?.data?.detail ?? 'Failed to propose trade')
    } finally { setSubmittingTrade(false) }
  }

  const voteOnTrade = async (tradeId: number, vote: 'approve' | 'deny') => {
    try {
      await axios.post(`/trades/${tradeId}/vote`, { vote }, { withCredentials: true })
      setMsg(`Vote cast: ${vote}`)
      loadAll()
    } catch (e: any) {
      setMsg(e.response?.data?.detail ?? 'Failed to vote')
    }
  }

  const cancelTrade = async (tradeId: number) => {
    if (!confirm('Cancel this trade?')) return
    try {
      await axios.post(`/trades/${tradeId}/cancel`, {}, { withCredentials: true })
      setMsg('Trade cancelled')
      loadAll()
    } catch (e: any) {
      setMsg(e.response?.data?.detail ?? 'Failed')
    }
  }

  const statusBadge = (status: string) => {
    const c: Record<string, string> = { pending: '#f59e0b', approved: '#22c55e', denied: '#ef4444', cancelled: '#888', voting: '#3b82f6', processed: '#22c55e', executed: '#22c55e' }
    const col = c[status] ?? '#888'
    return <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: col + '22', color: col, border: `1px solid ${col}` }}>{status}</span>
  }

  const inp = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '6px 10px',
    color: 'var(--color-text)',
    fontSize: '0.85rem',
    width: '100%',
  }

  const filteredFeed = feed.filter(e => filterType === 'all' || e.type === filterType)

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Transactions</h1>

      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {([['log', 'Transaction Log'], ['waivers', 'Waivers'], ['trades', 'Trade Centre']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setMsg('') }}
            className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
            style={{
              borderBottomColor: tab === id ? 'var(--color-primary)' : 'transparent',
              color: tab === id ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {msg && <p className={`text-sm ${msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}

      {/* Transaction Log */}
      {tab === 'log' && (
        <div className="space-y-3">
          <div className="flex gap-1">
            {(['all', 'waiver', 'trade'] as const).map(f => (
              <button key={f} onClick={() => setFilterType(f)}
                className="px-3 py-1 rounded-full text-xs capitalize transition-all"
                style={{
                  background: filterType === f ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: filterType === f ? '#fff' : 'var(--color-text-muted)',
                  border: filterType === f ? 'none' : '1px solid var(--color-border)',
                }}>
                {f === 'all' ? 'All' : f === 'waiver' ? 'FAs' : 'Trades'}
              </button>
            ))}
          </div>
          {filteredFeed.length === 0 ? (
            <div className="py-8 text-center rounded-xl border"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
              No completed transactions yet.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFeed.map((entry, i) => <FeedRow key={i} entry={entry} />)}
            </div>
          )}
        </div>
      )}

      {/* Waivers */}
      {tab === 'waivers' && (
        <div className="space-y-6">
          {waiverOrder.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 text-sm">Waiver Order</h3>
              <div className="flex gap-2 flex-wrap">
                {waiverOrder.map((o, i) => (
                  <div key={o.team_id} className="text-sm px-3 py-1 rounded-full"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <span className="font-mono text-xs mr-1" style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span>
                    {teamName(o.team_id)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoggedIn && (
            <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold">Submit Waiver Claim</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Add Pokemon</label>
                  <PokemonSearch
                    seasonPokemon={seasonPokemon}
                    value={addPokemon}
                    onSelect={setAddPokemon}
                    placeholder="Search available Pokemon…"
                    filterAvailable
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Drop Pokemon (optional)</label>
                  <PokemonSearch
                    seasonPokemon={seasonPokemon}
                    value={dropPokemon}
                    onSelect={setDropPokemon}
                    placeholder="Search your roster…"
                  />
                </div>
              </div>
              <button onClick={submitWaiver} disabled={submittingWaiver || !addPokemon}
                className="px-4 py-2 rounded text-white text-sm disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}>
                {submittingWaiver ? 'Submitting…' : 'Submit Claim'}
              </button>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-2 text-sm">Pending Claims</h3>
            {waivers.filter(w => w.status === 'pending').length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No pending waivers.</p>
            ) : (
              <div className="space-y-2">
                {waivers.filter(w => w.status === 'pending').sort((a, b) => (a.priority_at_time ?? 999) - (b.priority_at_time ?? 999)).map(w => {
                  const addName = seasonPokemon.find(sp => sp.species_id === w.add_species_id)?.species_name ?? `#${w.add_species_id}`
                  const dropName = w.drop_species_id ? (seasonPokemon.find(sp => sp.species_id === w.drop_species_id)?.species_name ?? `#${w.drop_species_id}`) : null
                  return (
                    <div key={w.id} className="flex items-center justify-between p-3 rounded-lg border"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                      <div className="text-sm">
                        <span className="font-medium">{teamName(w.team_id)}</span>
                        <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>Priority #{w.priority_at_time ?? '?'}</span>
                        <span className="ml-2 text-green-400">+ {addName}</span>
                        {dropName && <span className="ml-2 text-red-400">− {dropName}</span>}
                      </div>
                      {statusBadge(w.status)}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trade Centre */}
      {tab === 'trades' && (
        <div className="space-y-6">
          {isLoggedIn && (
            <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              <h3 className="font-semibold">Propose Trade</h3>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Trade with team</label>
                <select value={tradeToTeam} onChange={e => setTradeToTeam(+e.target.value)}
                  style={{ ...inp, width: 'auto', minWidth: 200 }}>
                  <option value="">— select team —</option>
                  {Object.values(teams).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>You give</div>
                  <div className="space-y-2">
                    {givePokemons.map((p, i) => (
                      <div key={i} className="flex gap-1">
                        <div className="flex-1">
                          <PokemonSearch
                            seasonPokemon={seasonPokemon}
                            value={p}
                            onSelect={sel => {
                              const next = [...givePokemons]
                              next[i] = sel
                              setGivePokemons(next)
                            }}
                            placeholder="Search Pokemon…"
                          />
                        </div>
                        {givePokemons.length > 1 && (
                          <button onClick={() => setGivePokemons(prev => prev.filter((_, j) => j !== i))}
                            className="text-red-400 px-2">✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setGivePokemons(prev => [...prev, null])}
                      className="text-xs" style={{ color: 'var(--color-primary)' }}>+ add</button>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>You receive</div>
                  <div className="space-y-2">
                    {receivePokemons.map((p, i) => (
                      <div key={i} className="flex gap-1">
                        <div className="flex-1">
                          <PokemonSearch
                            seasonPokemon={seasonPokemon}
                            value={p}
                            onSelect={sel => {
                              const next = [...receivePokemons]
                              next[i] = sel
                              setReceivePokemons(next)
                            }}
                            placeholder="Search Pokemon…"
                          />
                        </div>
                        {receivePokemons.length > 1 && (
                          <button onClick={() => setReceivePokemons(prev => prev.filter((_, j) => j !== i))}
                            className="text-red-400 px-2">✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setReceivePokemons(prev => [...prev, null])}
                      className="text-xs" style={{ color: 'var(--color-primary)' }}>+ add</button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Notes (optional)</label>
                <input value={tradeNotes} onChange={e => setTradeNotes(e.target.value)} style={inp} placeholder="Any context…" />
              </div>
              <button onClick={submitTrade} disabled={submittingTrade}
                className="px-4 py-2 rounded text-white text-sm disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}>
                {submittingTrade ? 'Proposing…' : 'Propose Trade'}
              </button>
            </div>
          )}

          {/* Active trades */}
          <div>
            <h3 className="font-semibold mb-2 text-sm">Active Trades</h3>
            {trades.filter(t => ['pending', 'voting'].includes(t.status)).length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No active trade proposals.</p>
            ) : (
              <div className="space-y-2">
                {trades.filter(t => ['pending', 'voting'].includes(t.status)).map(t => (
                  <div key={t.id} className="p-4 rounded-xl border space-y-2"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{teamName(t.proposed_by_team_id)}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>↔</span>
                      <span className="font-medium">{teamName(t.proposed_to_team_id)}</span>
                      {statusBadge(t.status)}
                      <span className="text-xs ml-auto" style={{ color: 'var(--color-text-muted)' }}>
                        {new Date(t.proposed_at).toLocaleDateString()}
                      </span>
                    </div>
                    {t.notes && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t.notes}</p>}
                    {isLoggedIn && (
                      <div className="flex gap-2">
                        <button onClick={() => voteOnTrade(t.id, 'approve')}
                          className="px-3 py-1 rounded text-xs text-white"
                          style={{ background: '#22c55e' }}>Approve</button>
                        <button onClick={() => voteOnTrade(t.id, 'deny')}
                          className="px-3 py-1 rounded text-xs text-white"
                          style={{ background: '#ef4444' }}>Deny</button>
                        <button onClick={() => cancelTrade(t.id)}
                          className="px-3 py-1 rounded text-xs"
                          style={{ border: '1px solid var(--color-border)' }}>Cancel</button>
                      </div>
                    )}
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

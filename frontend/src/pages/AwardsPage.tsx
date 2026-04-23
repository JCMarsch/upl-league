import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useActiveSeason } from '../hooks/useActiveSeason'

// ── Types ────────────────────────────────────────────────────────────────────

interface AwardEntry {
  id: number
  season_id: number
  season_name: string
  name: string
  description: string | null
  recipient_team_id: number | null
  recipient_team_name: string | null
  recipient_notes: string | null
  is_auto_calculated: boolean
}

interface Records {
  most_kills_season_pokemon?: { value: number; species_name: string; team_name: string; season_name: string }
  best_win_pct_season?: { value: number; record: string; team_name: string; season_name: string }
  most_kills_single_game?: { value: number; species_name: string; team_name: string; game_id: number }
  longest_game?: { value: number; label: string; game_id: number }
  shortest_game?: { value: number; label: string; game_id: number }
}

interface Team { id: number; name: string }

// ── AWARD_TYPES ──────────────────────────────────────────────────────────────

const AWARD_TYPES = [
  'MVP', 'Rookie of the Season', 'Sleeper Pick', 'Best Trade',
  'Best Waiver', 'Miss Pick', 'Best Record', 'Most Kills', 'Champion',
]

const AWARD_ICONS: Record<string, string> = {
  Champion: '🏆', MVP: '⭐', 'Rookie of the Season': '🌱',
  'Sleeper Pick': '💤', 'Best Trade': '🔄', 'Best Waiver': '📋',
  'Miss Pick': '🪵', 'Best Record': '📊', 'Most Kills': '⚔️',
}

// ── RecordCard ────────────────────────────────────────────────────────────────

function RecordCard({ label, value, sub, detail }: { label: string; value: string; sub?: string; detail?: string }) {
  return (
    <div className="rounded-xl border p-4 text-center" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
      <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>{value}</div>
      {sub && <div className="text-sm font-medium mt-0.5">{sub}</div>}
      <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
      {detail && <div className="text-xs mt-0.5 opacity-70" style={{ color: 'var(--color-text-muted)' }}>{detail}</div>}
    </div>
  )
}

// ── AdminAwardPanel ───────────────────────────────────────────────────────────

function AdminAwardPanel({ seasonId, teams, onCreated }: { seasonId: number; teams: Team[]; onCreated: () => void }) {
  const [name, setName] = useState(AWARD_TYPES[0])
  const [teamId, setTeamId] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!name || !teamId) return
    setSaving(true); setErr('')
    try {
      await axios.post(`/seasons/${seasonId}/awards`, {
        name,
        recipient_team_id: teamId,
        recipient_notes: notes || undefined,
        is_auto_calculated: false,
      }, { withCredentials: true })
      setNotes('')
      setTeamId('')
      onCreated()
    } catch (e: any) {
      setErr(e.response?.data?.detail ?? 'Failed')
    } finally { setSaving(false) }
  }

  const sel = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '6px 10px',
    color: 'var(--color-text)',
    fontSize: '0.85rem',
  }

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: '#ef444444', background: 'var(--color-surface)' }}>
      <div className="text-sm font-semibold text-red-400">Admin — Assign Award</div>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Award</div>
          <select value={name} onChange={e => setName(e.target.value)} style={{ ...sel, minWidth: 160 }}>
            {AWARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Team</div>
          <select value={teamId} onChange={e => setTeamId(+e.target.value)} style={{ ...sel, minWidth: 140 }}>
            <option value="">— select —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Notes (optional)</div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. reason for award…"
            style={{ ...sel, width: '100%' }} />
        </div>
        <button onClick={save} disabled={saving || !name || !teamId}
          className="px-4 py-2 rounded text-sm text-white disabled:opacity-40"
          style={{ background: '#ef4444' }}>
          {saving ? 'Saving…' : 'Assign'}
        </button>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

type Tab = 'records' | 'wall' | 'season'

export default function AwardsPage() {
  const { user } = useAuthStore()
  const { seasonId, seasons, setSeasonId } = useActiveSeason()
  const [tab, setTab] = useState<Tab>('records')
  const [awards, setAwards] = useState<AwardEntry[]>([])
  const [records, setRecords] = useState<Records>({})
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = user && (user.roles.includes('admin') || user.roles.includes('superadmin'))

  const loadData = () => {
    setLoading(true)
    Promise.all([
      axios.get('/awards'),
      axios.get('/records'),
    ]).then(([aResp, rResp]) => {
      setAwards(aResp.data)
      setRecords(rResp.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (!seasonId) return
    axios.get(`/seasons/${seasonId}/teams`)
      .then(r => setTeams(r.data))
      .catch(() => {})
  }, [seasonId])

  const deleteAward = async (id: number, seasonId: number) => {
    if (!confirm('Delete this award?')) return
    await axios.delete(`/seasons/${seasonId}/awards/${id}`, { withCredentials: true })
    loadData()
  }

  const seasonAwards = awards.filter(a => a.season_id === seasonId)
  const wallAwards = awards.filter(a => a.name === 'Champion' || a.name === 'Best Record' || a.name === 'Most Kills')

  // Group wall of fame by season
  const wallBySeason: Record<string, AwardEntry[]> = {}
  for (const a of wallAwards) {
    const key = a.season_name
    if (!wallBySeason[key]) wallBySeason[key] = []
    wallBySeason[key].push(a)
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Awards & Records</h1>
        {seasons.length > 1 && (
          <select value={seasonId ?? ''} onChange={e => setSeasonId(+e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1">
        {([['records', 'Records'], ['wall', 'Wall of Fame'], ['season', 'Season Awards']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-full text-sm transition-all"
            style={{
              background: tab === t ? 'var(--color-primary)' : 'var(--color-surface)',
              color: tab === t ? '#fff' : 'var(--color-text-muted)',
              border: tab === t ? 'none' : '1px solid var(--color-border)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : (
        <>
          {/* Records tab */}
          {tab === 'records' && (
            <div>
              {Object.keys(records).length === 0 ? (
                <div className="py-8 text-center rounded-xl border"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                  No records yet — log some matches to see all-time records here.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {records.most_kills_season_pokemon && (
                    <RecordCard
                      label="Most kills in a season (Pokemon)"
                      value={String(records.most_kills_season_pokemon.value)}
                      sub={records.most_kills_season_pokemon.species_name}
                      detail={`${records.most_kills_season_pokemon.team_name} · ${records.most_kills_season_pokemon.season_name}`}
                    />
                  )}
                  {records.best_win_pct_season && (
                    <RecordCard
                      label="Best win% in a season"
                      value={`${records.best_win_pct_season.value}%`}
                      sub={records.best_win_pct_season.record}
                      detail={`${records.best_win_pct_season.team_name} · ${records.best_win_pct_season.season_name}`}
                    />
                  )}
                  {records.most_kills_single_game && (
                    <RecordCard
                      label="Most kills in a single game (Pokemon)"
                      value={String(records.most_kills_single_game.value)}
                      sub={records.most_kills_single_game.species_name}
                      detail={records.most_kills_single_game.team_name}
                    />
                  )}
                  {records.longest_game && (
                    <RecordCard
                      label="Longest game"
                      value={`${records.longest_game.value} turns`}
                    />
                  )}
                  {records.shortest_game && (
                    <RecordCard
                      label="Shortest game"
                      value={`${records.shortest_game.value} turns`}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Wall of Fame tab */}
          {tab === 'wall' && (
            <div className="space-y-4">
              {Object.keys(wallBySeason).length === 0 ? (
                <div className="py-8 text-center rounded-xl border"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                  No completed seasons yet.
                </div>
              ) : (
                Object.entries(wallBySeason).map(([seasonName, seasonAwardsList]) => (
                  <div key={seasonName} className="rounded-xl border p-4"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                    <div className="font-semibold mb-3">{seasonName}</div>
                    <div className="flex flex-wrap gap-3">
                      {seasonAwardsList.map(a => (
                        <div key={a.id} className="flex items-center gap-2 rounded-lg px-3 py-2"
                          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                          <span className="text-xl">{AWARD_ICONS[a.name] ?? '🏅'}</span>
                          <div>
                            <div className="text-xs font-medium">{a.name}</div>
                            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{a.recipient_team_name ?? '—'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Season Awards tab */}
          {tab === 'season' && (
            <div className="space-y-4">
              {isAdmin && seasonId && (
                <AdminAwardPanel
                  seasonId={seasonId}
                  teams={teams}
                  onCreated={loadData}
                />
              )}
              {seasonAwards.length === 0 ? (
                <div className="py-8 text-center rounded-xl border"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                  No awards assigned for this season yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {seasonAwards.map(a => (
                    <div key={a.id} className="flex items-start gap-3 rounded-xl border p-4"
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                      <span className="text-2xl mt-0.5">{AWARD_ICONS[a.name] ?? '🏅'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{a.name}</div>
                        {a.recipient_team_name && (
                          <div className="text-sm mt-0.5" style={{ color: 'var(--color-primary)' }}>
                            {a.recipient_team_name}
                          </div>
                        )}
                        {a.recipient_notes && (
                          <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{a.recipient_notes}</div>
                        )}
                        {a.is_auto_calculated && (
                          <span className="text-xs px-1.5 py-0.5 rounded mt-1 inline-block"
                            style={{ background: '#3b82f622', color: '#3b82f6' }}>auto</span>
                        )}
                      </div>
                      {isAdmin && (
                        <button onClick={() => deleteAward(a.id, a.season_id)}
                          className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

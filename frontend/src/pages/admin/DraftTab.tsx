import { useState, useEffect } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../../hooks/useActiveSeason'

interface Team { id: number; name: string }
interface DraftOrderItem { team_id: number; team_name: string }

export default function DraftTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [order, setOrder] = useState<DraftOrderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const sid = selectedSeason ?? seasonId

  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])

  useEffect(() => {
    if (!sid) return
    setLoading(true)
    Promise.all([
      axios.get(`/seasons/${sid}/teams`),
      axios.get(`/draft/${sid}/order`),
    ])
      .then(([teamsRes, orderRes]) => {
        setTeams(teamsRes.data)
        if (orderRes.data.length > 0) {
          setOrder(orderRes.data)
        } else {
          setOrder(teamsRes.data.map((t: Team) => ({ team_id: t.id, team_name: t.name })))
        }
      })
      .finally(() => setLoading(false))
  }, [sid])

  const randomize = () => {
    setOrder(prev => [...prev].sort(() => Math.random() - 0.5))
    setMsg('')
  }

  const saveOrder = async () => {
    if (!sid) return
    setSaving(true); setErr(''); setMsg('')
    try {
      await axios.post(`/draft/${sid}/order`, { team_ids: order.map(o => o.team_id) }, { withCredentials: true })
      setMsg('Draft order saved.')
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  const moveUp = (idx: number) => {
    if (idx === 0) return
    setOrder(prev => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  const moveDown = (idx: number) => {
    if (idx === order.length - 1) return
    setOrder(prev => {
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  const onDragStart = (idx: number) => setDragIdx(idx)
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    setOrder(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(idx, 0, moved)
      return next
    })
    setDragIdx(idx)
  }
  const onDragEnd = () => setDragIdx(null)

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Draft Order</h2>
        {seasons.length > 1 && (
          <select
            value={sid ?? ''}
            onChange={e => setSelectedSeason(+e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Set the round-1 pick order. The draft will snake from here (round 2 reverses, round 3 same as round 1, etc.).
        Drag rows or use the arrows to reorder. Must be saved before the draft starts.
      </p>

      {loading ? (
        <div className="py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : (
        <>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
            {order.map((item, idx) => (
              <div
                key={item.team_id}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDragEnd={onDragEnd}
                className="flex items-center gap-3 px-4 py-3 cursor-grab active:cursor-grabbing"
                style={{
                  borderTop: idx > 0 ? '1px solid var(--color-border)' : undefined,
                  background: dragIdx === idx ? 'var(--color-bg)' : 'var(--color-surface)',
                  userSelect: 'none',
                }}
              >
                <span className="text-sm font-mono w-6 text-right" style={{ color: 'var(--color-text-muted)' }}>{idx + 1}</span>
                <span className="flex-1 font-medium text-sm">{item.team_name}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="px-2 py-1 text-xs rounded disabled:opacity-30 hover:opacity-70"
                    style={{ background: 'var(--color-bg)' }}
                  >↑</button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === order.length - 1}
                    className="px-2 py-1 text-xs rounded disabled:opacity-30 hover:opacity-70"
                    style={{ background: 'var(--color-bg)' }}
                  >↓</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={randomize}
              className="px-4 py-2 rounded text-sm border"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Randomize
            </button>
            <button
              onClick={saveOrder}
              disabled={saving}
              className="px-4 py-2 rounded text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}
            >
              {saving ? 'Saving…' : 'Save Order'}
            </button>
          </div>

          {msg && <p className="text-sm text-green-600">{msg}</p>}
          {err && <p className="text-sm text-red-500">{err}</p>}
        </>
      )}
    </div>
  )
}

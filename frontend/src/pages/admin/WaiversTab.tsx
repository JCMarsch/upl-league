import { useState, useEffect } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../../hooks/useActiveSeason'

interface Waiver {
  id: number; team_id: number; status: string
  add_species_id: number; drop_species_id: number | null
  priority_at_time: number | null; submitted_at: string
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function WaiversTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [schedule, setSchedule] = useState({ day_of_week: 2, hour: 22, minute: 0 })
  const [msg, setMsg] = useState('')
  const [processing, setProcessing] = useState(false)

  const sid = selectedSeason ?? seasonId
  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])

  useEffect(() => {
    if (!sid) return
    axios.get(`/seasons/${sid}/waivers`).then(r => setWaivers(r.data))
    axios.get(`/admin/seasons/${sid}/waiver-schedule`, { withCredentials: true })
      .then(r => setSchedule(r.data)).catch(() => {})
  }, [sid])

  const saveSchedule = async () => {
    try {
      await axios.post(`/admin/seasons/${sid}/waiver-schedule`, schedule, { withCredentials: true })
      setMsg('Schedule saved!')
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
  }

  const processNow = async () => {
    setProcessing(true); setMsg('')
    try {
      const r = await axios.post(`/admin/seasons/${sid}/waivers/process-all`, {}, { withCredentials: true })
      setMsg(`Processed ${r.data.processed} waiver(s)`)
      axios.get(`/seasons/${sid}/waivers`).then(r => setWaivers(r.data))
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
    finally { setProcessing(false) }
  }

  const processOne = async (id: number, approve: boolean) => {
    try {
      await axios.post(`/seasons/${sid}/waivers/${id}/process?approve=${approve}`, {}, { withCredentials: true })
      axios.get(`/seasons/${sid}/waivers`).then(r => setWaivers(r.data))
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
  }

  const pending = waivers.filter(w => w.status === 'pending')
  const processed = waivers.filter(w => w.status !== 'pending')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Waivers</h2>
        <select value={sid ?? ''} onChange={e => setSelectedSeason(+e.target.value)}
          className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {msg && <p className="text-sm text-green-600">{msg}</p>}

      {/* Processing Schedule */}
      <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: 'var(--color-border)' }}>
        <h3 className="font-medium">Auto-Processing Schedule (UTC)</h3>
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="block text-xs mb-1">Day</label>
            <select value={schedule.day_of_week} onChange={e => setSchedule(s => ({ ...s, day_of_week: +e.target.value }))}
              className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Hour (0–23)</label>
            <input type="number" min={0} max={23} value={schedule.hour} onChange={e => setSchedule(s => ({ ...s, hour: +e.target.value }))}
              className="border rounded px-2 py-1 text-sm w-20" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
          </div>
          <div>
            <label className="block text-xs mb-1">Minute (0–59)</label>
            <input type="number" min={0} max={59} value={schedule.minute} onChange={e => setSchedule(s => ({ ...s, minute: +e.target.value }))}
              className="border rounded px-2 py-1 text-sm w-20" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} />
          </div>
          <button onClick={saveSchedule} className="px-4 py-1.5 rounded text-white text-sm" style={{ background: 'var(--color-primary)' }}>Save Schedule</button>
          <button onClick={processNow} disabled={processing} className="px-4 py-1.5 rounded text-sm border" style={{ borderColor: 'var(--color-border)' }}>
            {processing ? 'Processing...' : 'Process Now'}
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Auto-processes every {DAYS[schedule.day_of_week]} at {String(schedule.hour).padStart(2, '0')}:{String(schedule.minute).padStart(2, '0')} UTC
        </p>
      </div>

      {/* Pending Waivers */}
      <div>
        <h3 className="font-medium mb-2">Pending ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No pending waivers.</p>
        ) : (
          <div className="space-y-2">
            {pending.map(w => (
              <div key={w.id} className="border rounded p-3 flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
                <div className="text-sm">
                  <span>Waiver #{w.id}</span>
                  <span className="ml-3" style={{ color: 'var(--color-text-muted)' }}>Priority: {w.priority_at_time ?? '–'}</span>
                  <span className="ml-3" style={{ color: 'var(--color-text-muted)' }}>Submitted: {new Date(w.submitted_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => processOne(w.id, true)} className="px-3 py-1 text-xs rounded bg-green-600 text-white">Approve</button>
                  <button onClick={() => processOne(w.id, false)} className="px-3 py-1 text-xs rounded bg-red-600 text-white">Deny</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Processed Waivers */}
      {processed.length > 0 && (
        <div>
          <h3 className="font-medium mb-2">Processed ({processed.length})</h3>
          <div className="space-y-2">
            {processed.slice(0, 10).map(w => (
              <div key={w.id} className="border rounded p-3 flex items-center justify-between opacity-60" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-sm">Waiver #{w.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${w.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{w.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import axios from 'axios'
import { useActiveSeason } from '../../hooks/useActiveSeason'
import { TIERS } from '../../constants/tiers'

interface TierConfig {
  regular: Record<string, number | null>
  mega: Record<string, number | null>
}

export default function TierPricingTab() {
  const { seasonId, seasons } = useActiveSeason()
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [config, setConfig] = useState<TierConfig>({
    regular: Object.fromEntries(TIERS.map(t => [t, null])),
    mega: Object.fromEntries(TIERS.map(t => [t, null])),
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const sid = selectedSeason ?? seasonId

  useEffect(() => { if (seasonId && !selectedSeason) setSelectedSeason(seasonId) }, [seasonId])

  useEffect(() => {
    if (!sid) return
    axios.get(`/seasons/${sid}/tier-config`)
      .then(r => setConfig(r.data))
      .catch(() => {})
  }, [sid])

  const setVal = (kind: 'regular' | 'mega', tier: string, val: string) => {
    setConfig(c => ({
      ...c,
      [kind]: { ...c[kind], [tier]: val === '' ? null : parseInt(val, 10) },
    }))
  }

  const save = async () => {
    setSaving(true); setMsg('')
    try {
      await axios.post(`/seasons/${sid}/tier-config`, config, { withCredentials: true })
      setMsg('Saved!')
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Tier Point Pricing</h2>
        <select value={sid ?? ''} onChange={e => setSelectedSeason(+e.target.value)}
          className="border rounded px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Set how many points each tier costs. When a Pokemon is assigned to a tier, its point cost is filled in automatically.
      </p>

      <div className="grid grid-cols-2 gap-6">
        {/* Regular tiers */}
        <div>
          <h3 className="font-semibold mb-3">Regular Tiers</h3>
          <div className="space-y-2">
            {TIERS.map(tier => (
              <div key={tier} className="flex items-center gap-3">
                <span className="w-12 font-bold text-sm">{tier}</span>
                <input
                  type="number"
                  min={0}
                  value={config.regular[tier] ?? ''}
                  onChange={e => setVal('regular', tier, e.target.value)}
                  placeholder="pts"
                  className="border rounded px-2 py-1 text-sm w-24"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Mega tiers */}
        <div>
          <h3 className="font-semibold mb-3">Mega Tiers</h3>
          <div className="space-y-2">
            {TIERS.map(tier => (
              <div key={tier} className="flex items-center gap-3">
                <span className="w-12 font-bold text-sm">{tier}</span>
                <input
                  type="number"
                  min={0}
                  value={config.mega[tier] ?? ''}
                  onChange={e => setVal('mega', tier, e.target.value)}
                  placeholder="pts"
                  className="border rounded px-2 py-1 text-sm w-24"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded text-white text-sm"
          style={{ background: 'var(--color-primary)' }}
        >
          {saving ? 'Saving...' : 'Save Pricing'}
        </button>
        {msg && (
          <span className={`text-sm ${msg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>{msg}</span>
        )}
      </div>
    </div>
  )
}

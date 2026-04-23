import { useState } from 'react'
import SeasonsTab from './admin/SeasonsTab'
import PokemonTab from './admin/PokemonTab'
import DragTierTab from './admin/DragTierTab'
import TierPricingTab from './admin/TierPricingTab'
import TeamsTab from './admin/TeamsTab'
import UsersTab from './admin/UsersTab'
import WaiversTab from './admin/WaiversTab'
import TradesTab from './admin/TradesTab'
import EditTab from './admin/EditTab'

type Tab = 'seasons' | 'tier-list' | 'tier-pricing' | 'pokemon' | 'teams' | 'users' | 'waivers' | 'trades' | 'edit'

const TABS: { key: Tab; label: string }[] = [
  { key: 'seasons', label: 'Seasons' },
  { key: 'tier-list', label: 'Tier List' },
  { key: 'tier-pricing', label: 'Tier Pricing' },
  { key: 'pokemon', label: 'Pokemon (Table)' },
  { key: 'teams', label: 'Teams' },
  { key: 'users', label: 'Users' },
  { key: 'waivers', label: 'Waivers' },
  { key: 'trades', label: 'Trades' },
  { key: 'edit', label: 'Edit' },
]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('seasons')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b mb-6 overflow-x-auto" style={{ borderColor: 'var(--color-border)' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
            style={{
              borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: tab === t.key ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'seasons' && <SeasonsTab />}
      {tab === 'tier-list' && <DragTierTab />}
      {tab === 'tier-pricing' && <TierPricingTab />}
      {tab === 'pokemon' && <PokemonTab />}
      {tab === 'teams' && <TeamsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'waivers' && <WaiversTab />}
      {tab === 'trades' && <TradesTab />}
      {tab === 'edit' && <EditTab />}
    </div>
  )
}

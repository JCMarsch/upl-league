import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// ── Types ────────────────────────────────────────────────────────────────────

interface Match {
  id: number
  season_id: number
  week_number: number
  home_team_id: number
  away_team_id: number
  home_games_won: number
  away_games_won: number
  winner_team_id: number | null
  status: string
  notes?: string
}

interface RosterPokemon {
  id: number
  species_id: number | null
  species_name: string | null
  species_sprite_url: string | null
  species_type1: string | null
  species_type2: string | null
  tier: string | null
}

interface TeamDetail {
  id: number
  name: string
  abbreviation: string | null
  primary_color: string
  secondary_color: string
  logo_url: string | null
  roster: RosterPokemon[]
}

interface GameStat {
  id: number
  game_id: number
  team_id: number
  species_id: number
  was_brought: boolean
  was_lead: boolean
  direct_kills: number
  passive_kills: number
  direct_deaths: number
  passive_deaths: number
}

interface KillEvent {
  id: number
  game_id: number
  turn_number: number
  attacker_team_id: number
  attacker_species_id: number
  defender_team_id: number
  defender_species_id: number
  move_name: string | null
  kill_type: string
}

interface GameDetail {
  id: number
  match_id: number
  game_number: number
  winner_team_id: number | null
  loser_team_id: number | null
  replay_url: string | null
  replay_source: string | null
  replay_parsed: boolean
  stats: GameStat[]
  kill_events: KillEvent[]
}

// ── Wizard draft types ───────────────────────────────────────────────────────

type BringState = 'none' | 'brought' | 'lead'

interface BringEntry {
  speciesId: number | null
  speciesName: string
  state: BringState
}

interface KillDraft {
  localId: string
  turnNumber: number
  attackerSide: 'home' | 'away'
  attackerSpeciesId: number | null
  attackerSpeciesName: string
  defenderSide: 'home' | 'away'
  defenderSpeciesId: number | null
  defenderSpeciesName: string
  moveName: string
  killType: 'direct' | 'passive' | 'hazard' | 'status' | 'recoil'
  source: 'parsed' | 'manual'
}

interface GameDraft {
  gameNumber: number
  winnerSide: 'home' | 'away' | null
  replayUrl: string
  replayParsed: boolean
  p1IsHome: boolean
  p1Name: string
  p2Name: string
  homeBrings: BringEntry[]
  awayBrings: BringEntry[]
  killEvents: KillDraft[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#8b5cf6', B: '#3b82f6', C: '#22c55e', D: '#ef4444', Free: '#6b7280',
}

const TYPE_COLORS: Record<string, string> = {
  Normal: '#A8A878', Fire: '#F08030', Water: '#6890F0', Electric: '#F8D030',
  Grass: '#78C850', Ice: '#98D8D8', Fighting: '#C03028', Poison: '#A040A0',
  Ground: '#E0C068', Flying: '#A890F0', Psychic: '#F85888', Bug: '#A8B820',
  Rock: '#B8A038', Ghost: '#705898', Dragon: '#7038F8', Dark: '#705848',
  Steel: '#B8B8D0', Fairy: '#EE99AC',
}

let _localIdCounter = 0
function localId() { return `local-${++_localIdCounter}` }

function fuzzyMatchRoster(name: string, roster: RosterPokemon[]): RosterPokemon | null {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return roster.find(r => {
    const rn = (r.species_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
    return rn === n
  }) ?? null
}

function initGameDraft(gameNumber: number): GameDraft {
  return {
    gameNumber,
    winnerSide: null,
    replayUrl: '',
    replayParsed: false,
    p1IsHome: true,
    p1Name: '',
    p2Name: '',
    homeBrings: [],
    awayBrings: [],
    killEvents: [],
  }
}

function rosterBringEntries(roster: RosterPokemon[]): BringEntry[] {
  return roster.map(r => ({
    speciesId: r.species_id,
    speciesName: r.species_name ?? '',
    state: 'none' as BringState,
  }))
}

// ── Small UI components ──────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
      style={{ background: TYPE_COLORS[type] ?? '#888', fontSize: '0.65rem' }}>
      {type}
    </span>
  )
}

function KillTypeBadge({ t }: { t: string }) {
  const colors: Record<string, string> = {
    direct: '#3b82f6', passive: '#8b5cf6', hazard: '#f59e0b',
    status: '#ef4444', recoil: '#22c55e',
  }
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
      style={{ background: colors[t] ?? '#888', fontSize: '0.65rem' }}>
      {t}
    </span>
  )
}

function SpriteBtn({
  entry, onClick, size = 48,
}: {
  entry: BringEntry
  onClick: () => void
  size?: number
}) {
  const pokemon = entry
  return (
    <button
      onClick={onClick}
      title={`${pokemon.speciesName} — click to cycle: none → brought → lead`}
      className="relative rounded-lg transition-all flex flex-col items-center gap-0.5 p-1"
      style={{
        opacity: entry.state === 'none' ? 0.35 : 1,
        outline: entry.state !== 'none' ? '2px solid var(--color-primary)' : '2px solid transparent',
        background: entry.state === 'lead' ? 'var(--color-primary)1a' : 'transparent',
        minWidth: size + 8,
      }}
    >
      {entry.state === 'lead' && (
        <span className="absolute top-0.5 right-0.5 text-yellow-400 text-xs leading-none">★</span>
      )}
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* species sprite placeholder if no URL */}
        <span className="text-xs text-center leading-tight" style={{ color: 'var(--color-text-muted)', maxWidth: size }}>
          {pokemon.speciesName.substring(0, 8)}
        </span>
      </div>
      <span className="text-xs truncate" style={{ maxWidth: size + 4, color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
        {pokemon.speciesName.length > 10 ? pokemon.speciesName.substring(0, 9) + '…' : pokemon.speciesName}
      </span>
    </button>
  )
}

function SpriteWithImg({
  entry, onClick,
}: {
  entry: BringEntry & { spriteUrl?: string | null }
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={`${entry.speciesName} — click to cycle`}
      className="relative rounded-lg transition-all flex flex-col items-center p-1"
      style={{
        opacity: entry.state === 'none' ? 0.32 : 1,
        outline: entry.state !== 'none' ? '2px solid var(--color-primary)' : '2px solid transparent',
        background: entry.state === 'lead' ? 'var(--color-primary)1a' : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {entry.state === 'lead' && (
        <span className="absolute top-0.5 right-0.5 text-yellow-400 text-xs leading-none">★</span>
      )}
      {entry.spriteUrl ? (
        <img src={entry.spriteUrl} alt={entry.speciesName} style={{ width: 48, height: 48 }} />
      ) : (
        <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
            {entry.speciesName.substring(0, 6)}
          </span>
        </div>
      )}
      <span className="text-xs truncate" style={{ maxWidth: 56, color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
        {entry.speciesName.length > 8 ? entry.speciesName.substring(0, 7) + '…' : entry.speciesName}
      </span>
    </button>
  )
}

// ── BringGrid ────────────────────────────────────────────────────────────────

function BringGrid({
  label, color, brings, roster, onChange,
}: {
  label: string
  color: string
  brings: BringEntry[]
  roster: RosterPokemon[]
  onChange: (next: BringEntry[]) => void
}) {
  const spriteMap: Record<string, string | null> = {}
  for (const r of roster) {
    if (r.species_name) spriteMap[r.species_name] = r.species_sprite_url
  }

  const cycle = (i: number) => {
    const next = [...brings]
    const states: BringState[] = ['none', 'brought', 'lead']
    const cur = states.indexOf(next[i].state)
    next[i] = { ...next[i], state: states[(cur + 1) % 3] }
    onChange(next)
  }

  const broughtCount = brings.filter(b => b.state !== 'none').length

  return (
    <div>
      <div className="text-xs font-semibold mb-1 flex items-center gap-2" style={{ color }}>
        {label}
        <span className="font-normal" style={{ color: 'var(--color-text-muted)' }}>
          {broughtCount}/4 brought · {brings.filter(b => b.state === 'lead').length}/2 leads
        </span>
      </div>
      <div className="flex flex-wrap gap-1 p-2 rounded-lg" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
        {brings.map((b, i) => (
          <SpriteWithImg
            key={b.speciesName + i}
            entry={{ ...b, spriteUrl: spriteMap[b.speciesName] }}
            onClick={() => cycle(i)}
          />
        ))}
        {brings.length === 0 && (
          <span className="text-xs py-2 px-3" style={{ color: 'var(--color-text-muted)' }}>No roster loaded</span>
        )}
      </div>
    </div>
  )
}

// ── AddKillForm ──────────────────────────────────────────────────────────────

function AddKillForm({
  homeBrings, awayBrings, homeTeamName, awayTeamName, onAdd,
}: {
  homeBrings: BringEntry[]
  awayBrings: BringEntry[]
  homeTeamName: string
  awayTeamName: string
  onAdd: (k: KillDraft) => void
}) {
  const [turn, setTurn] = useState(1)
  const [atkSide, setAtkSide] = useState<'home' | 'away'>('home')
  const [atkName, setAtkName] = useState('')
  const [defSide, setDefSide] = useState<'home' | 'away'>('away')
  const [defName, setDefName] = useState('')
  const [move, setMove] = useState('')
  const [kt, setKt] = useState<KillDraft['killType']>('direct')

  const atkOptions = atkSide === 'home'
    ? homeBrings.filter(b => b.state !== 'none')
    : awayBrings.filter(b => b.state !== 'none')
  const defOptions = defSide === 'home'
    ? homeBrings.filter(b => b.state !== 'none')
    : awayBrings.filter(b => b.state !== 'none')

  const atkEntry = [...homeBrings, ...awayBrings].find(b => b.speciesName === atkName)
  const defEntry = [...homeBrings, ...awayBrings].find(b => b.speciesName === defName)

  const add = () => {
    if (!atkName || !defName) return
    onAdd({
      localId: localId(),
      turnNumber: turn,
      attackerSide: atkSide,
      attackerSpeciesId: atkEntry?.speciesId ?? null,
      attackerSpeciesName: atkName,
      defenderSide: defSide,
      defenderSpeciesId: defEntry?.speciesId ?? null,
      defenderSpeciesName: defName,
      moveName: move,
      killType: kt,
      source: 'manual',
    })
    setMove('')
    setAtkName('')
    setDefName('')
  }

  const selectStyle = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '4px 8px',
    color: 'var(--color-text)',
    fontSize: '0.8rem',
  }

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Add kill event</div>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Turn</div>
          <input type="number" min={1} value={turn} onChange={e => setTurn(+e.target.value)}
            style={{ ...selectStyle, width: 60, textAlign: 'center' }} />
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Attacker team</div>
          <select value={atkSide} onChange={e => { setAtkSide(e.target.value as 'home'|'away'); setAtkName('') }} style={selectStyle}>
            <option value="home">{homeTeamName}</option>
            <option value="away">{awayTeamName}</option>
          </select>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Attacker</div>
          <select value={atkName} onChange={e => setAtkName(e.target.value)} style={{ ...selectStyle, minWidth: 120 }}>
            <option value="">—</option>
            {atkOptions.map(b => <option key={b.speciesName} value={b.speciesName}>{b.speciesName}</option>)}
          </select>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Move</div>
          <input value={move} onChange={e => setMove(e.target.value)} placeholder="optional"
            style={{ ...selectStyle, width: 120 }} />
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Defender team</div>
          <select value={defSide} onChange={e => { setDefSide(e.target.value as 'home'|'away'); setDefName('') }} style={selectStyle}>
            <option value="away">{awayTeamName}</option>
            <option value="home">{homeTeamName}</option>
          </select>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Defender (KO'd)</div>
          <select value={defName} onChange={e => setDefName(e.target.value)} style={{ ...selectStyle, minWidth: 120 }}>
            <option value="">—</option>
            {defOptions.map(b => <option key={b.speciesName} value={b.speciesName}>{b.speciesName}</option>)}
          </select>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Type</div>
          <select value={kt} onChange={e => setKt(e.target.value as KillDraft['killType'])} style={selectStyle}>
            {(['direct', 'passive', 'hazard', 'status', 'recoil'] as const).map(t =>
              <option key={t} value={t}>{t}</option>
            )}
          </select>
        </div>
        <button onClick={add} disabled={!atkName || !defName}
          className="px-3 py-1.5 rounded text-sm text-white disabled:opacity-40"
          style={{ background: 'var(--color-primary)' }}>
          + Add
        </button>
      </div>
    </div>
  )
}

// ── GameWizardStep ────────────────────────────────────────────────────────────

function GameWizardStep({
  draft, homeTeam, awayTeam, onChange,
}: {
  draft: GameDraft
  homeTeam: TeamDetail
  awayTeam: TeamDetail
  onChange: (next: GameDraft) => void
}) {
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  const parseReplay = async () => {
    if (!draft.replayUrl.trim()) return
    setParsing(true); setParseError('')
    try {
      const { data } = await axios.post('/parse-replay', { replay_url: draft.replayUrl }, { withCredentials: true })

      const p1IsHome = draft.p1IsHome

      const mapBrings = (names: string[], side: 'home' | 'away') => {
        const roster = side === 'home' ? homeTeam.roster : awayTeam.roster
        return names.map((name: string) => {
          const matched = fuzzyMatchRoster(name, roster)
          return {
            speciesId: matched?.species_id ?? null,
            speciesName: name,
            state: 'brought' as BringState,
          }
        })
      }

      const mapLeads = (names: string[], brings: BringEntry[]) => {
        const next = [...brings]
        for (const name of names) {
          const idx = next.findIndex(b => b.speciesName.toLowerCase() === name.toLowerCase())
          if (idx >= 0) next[idx] = { ...next[idx], state: 'lead' }
        }
        return next
      }

      const homeParserSide = p1IsHome ? 'p1' : 'p2'
      const awayParserSide = p1IsHome ? 'p2' : 'p1'

      let homeBrings = mapBrings(data[`${homeParserSide}_brought`] ?? [], 'home')
      homeBrings = mapLeads(data[`${homeParserSide}_leads`] ?? [], homeBrings)
      let awayBrings = mapBrings(data[`${awayParserSide}_brought`] ?? [], 'away')
      awayBrings = mapLeads(data[`${awayParserSide}_leads`] ?? [], awayBrings)

      const killEvents: KillDraft[] = (data.kill_events ?? []).map((ke: any) => {
        const atkIsHome = (ke.attacker_side === homeParserSide)
        const defIsHome = (ke.defender_side === homeParserSide)
        const atkRoster = atkIsHome ? homeTeam.roster : awayTeam.roster
        const defRoster = defIsHome ? homeTeam.roster : awayTeam.roster
        const atkMatched = fuzzyMatchRoster(ke.attacker_pokemon ?? '', atkRoster)
        const defMatched = fuzzyMatchRoster(ke.defender_pokemon ?? '', defRoster)
        return {
          localId: localId(),
          turnNumber: ke.turn_number,
          attackerSide: atkIsHome ? 'home' : 'away',
          attackerSpeciesId: atkMatched?.species_id ?? null,
          attackerSpeciesName: ke.attacker_pokemon ?? '',
          defenderSide: defIsHome ? 'home' : 'away',
          defenderSpeciesId: defMatched?.species_id ?? null,
          defenderSpeciesName: ke.defender_pokemon ?? '',
          moveName: ke.move_name ?? '',
          killType: ke.kill_type ?? 'direct',
          source: 'parsed' as const,
        }
      })

      let winnerSide: 'home' | 'away' | null = null
      if (data.winner_side === homeParserSide) winnerSide = 'home'
      else if (data.winner_side === awayParserSide) winnerSide = 'away'

      onChange({
        ...draft,
        replayParsed: true,
        p1Name: data.p1_name ?? '',
        p2Name: data.p2_name ?? '',
        homeBrings,
        awayBrings,
        killEvents,
        winnerSide,
      })
    } catch (e: any) {
      setParseError(e.response?.data?.detail ?? 'Failed to parse replay')
    } finally { setParsing(false) }
  }

  const flipSides = () => {
    onChange({
      ...draft,
      p1IsHome: !draft.p1IsHome,
      homeBrings: draft.awayBrings,
      awayBrings: draft.homeBrings,
      killEvents: draft.killEvents.map(ke => ({
        ...ke,
        attackerSide: ke.attackerSide === 'home' ? 'away' : 'home',
        defenderSide: ke.defenderSide === 'home' ? 'away' : 'home',
      })),
    })
  }

  const deleteKill = (localId: string) => {
    onChange({ ...draft, killEvents: draft.killEvents.filter(ke => ke.localId !== localId) })
  }

  const sel = (style?: object) => ({
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '4px 8px',
    color: 'var(--color-text)',
    fontSize: '0.85rem',
    ...style,
  })

  return (
    <div className="space-y-5">
      {/* Winner */}
      <div>
        <div className="text-sm font-medium mb-2">Game {draft.gameNumber} winner</div>
        <div className="flex gap-2">
          {(['home', 'away'] as const).map(side => (
            <button key={side}
              onClick={() => onChange({ ...draft, winnerSide: side })}
              className="px-4 py-2 rounded text-sm font-medium transition-all"
              style={{
                background: draft.winnerSide === side ? (side === 'home' ? homeTeam.primary_color : awayTeam.primary_color) : 'var(--color-surface)',
                color: draft.winnerSide === side ? '#fff' : 'var(--color-text)',
                border: `1px solid ${draft.winnerSide === side ? 'transparent' : 'var(--color-border)'}`,
              }}>
              {side === 'home' ? homeTeam.name : awayTeam.name}
            </button>
          ))}
        </div>
      </div>

      {/* Replay URL */}
      <div>
        <div className="text-sm font-medium mb-2">Replay URL <span className="font-normal text-xs" style={{ color: 'var(--color-text-muted)' }}>(optional)</span></div>
        <div className="flex gap-2">
          <input
            value={draft.replayUrl}
            onChange={e => onChange({ ...draft, replayUrl: e.target.value, replayParsed: false })}
            placeholder="https://replay.pokemonshowdown.com/... or psim.us replay URL"
            className="flex-1 rounded px-3 py-2 text-sm"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
          />
          <button
            onClick={parseReplay}
            disabled={parsing || !draft.replayUrl.trim()}
            className="px-4 py-2 rounded text-sm text-white disabled:opacity-40"
            style={{ background: '#8b5cf6' }}>
            {parsing ? 'Parsing…' : draft.replayParsed ? '✓ Parsed' : 'Parse Replay'}
          </button>
        </div>
        {parseError && <p className="text-xs text-red-500 mt-1">{parseError}</p>}
        {draft.replayParsed && draft.p1Name && (
          <div className="mt-2 flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <span>
              <span className="font-medium" style={{ color: 'var(--color-text)' }}>p1:</span> {draft.p1Name}
              {' = '}
              <span className="font-medium" style={{ color: homeTeam.primary_color }}>
                {draft.p1IsHome ? homeTeam.name : awayTeam.name}
              </span>
            </span>
            <button onClick={flipSides} className="text-xs underline" style={{ color: 'var(--color-primary)' }}>
              flip sides
            </button>
          </div>
        )}
      </div>

      {/* Bring grids */}
      <div className="space-y-3">
        <div className="text-sm font-medium">Brings <span className="text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>— click once to mark brought, again for lead, again to clear</span></div>
        <BringGrid
          label={homeTeam.name}
          color={homeTeam.primary_color}
          brings={draft.homeBrings}
          roster={homeTeam.roster}
          onChange={next => onChange({ ...draft, homeBrings: next })}
        />
        <BringGrid
          label={awayTeam.name}
          color={awayTeam.primary_color}
          brings={draft.awayBrings}
          roster={awayTeam.roster}
          onChange={next => onChange({ ...draft, awayBrings: next })}
        />
      </div>

      {/* Kill events */}
      <div>
        <div className="text-sm font-medium mb-2">Kill events</div>
        {draft.killEvents.length > 0 && (
          <div className="space-y-1 mb-3">
            {draft.killEvents.map(ke => (
              <div key={ke.localId} className="flex items-center gap-2 text-sm py-1.5 px-3 rounded"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                {ke.source === 'parsed' && (
                  <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: '#8b5cf6', fontSize: '0.6rem' }}>parsed</span>
                )}
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>T{ke.turnNumber}</span>
                <span className="font-medium" style={{ color: ke.attackerSide === 'home' ? homeTeam.primary_color : awayTeam.primary_color }}>
                  {ke.attackerSpeciesName}
                </span>
                {ke.moveName && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>({ke.moveName})</span>}
                <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                <span className="font-medium" style={{ color: ke.defenderSide === 'home' ? homeTeam.primary_color : awayTeam.primary_color }}>
                  {ke.defenderSpeciesName}
                </span>
                <KillTypeBadge t={ke.killType} />
                <button onClick={() => deleteKill(ke.localId)} className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
              </div>
            ))}
          </div>
        )}
        <AddKillForm
          homeBrings={draft.homeBrings}
          awayBrings={draft.awayBrings}
          homeTeamName={homeTeam.name}
          awayTeamName={awayTeam.name}
          onAdd={ke => onChange({ ...draft, killEvents: [...draft.killEvents, ke] })}
        />
      </div>
    </div>
  )
}

// ── SubmitWizard ─────────────────────────────────────────────────────────────

function SubmitWizard({
  match, homeTeam, awayTeam, onComplete, onCancel,
}: {
  match: Match
  homeTeam: TeamDetail
  awayTeam: TeamDetail
  onComplete: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState<'score' | number | 'review'>('score')
  const [homeScore, setHomeScore] = useState(match.home_games_won)
  const [awayScore, setAwayScore] = useState(match.away_games_won)
  const [notes, setNotes] = useState(match.notes ?? '')
  const [gameDrafts, setGameDrafts] = useState<GameDraft[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const totalGames = homeScore + awayScore

  const goToScore = () => setStep('score')
  const goToGame = (n: number) => {
    const needed = n
    setGameDrafts(prev => {
      const next = [...prev]
      while (next.length < needed) {
        const gNum = next.length + 1
        next.push({
          ...initGameDraft(gNum),
          homeBrings: rosterBringEntries(homeTeam.roster),
          awayBrings: rosterBringEntries(awayTeam.roster),
        })
      }
      return next
    })
    setStep(n)
  }
  const goToReview = () => setStep('review')

  const updateGame = (idx: number, next: GameDraft) => {
    setGameDrafts(prev => { const a = [...prev]; a[idx] = next; return a })
  }

  const submit = async () => {
    setSubmitting(true); setSubmitError('')
    try {
      // 1. Submit match score
      await axios.post(`/matches/${match.id}/submit`, {
        home_games_won: homeScore,
        away_games_won: awayScore,
        notes: notes || undefined,
      }, { withCredentials: true })

      // 2. Per-game data
      for (const gd of gameDrafts) {
        const winnerTeamId = gd.winnerSide === 'home' ? match.home_team_id
          : gd.winnerSide === 'away' ? match.away_team_id : null
        const loserTeamId = gd.winnerSide === 'home' ? match.away_team_id
          : gd.winnerSide === 'away' ? match.home_team_id : null

        const gameResp = await axios.post(`/matches/${match.id}/games`, {
          game_number: gd.gameNumber,
          winner_team_id: winnerTeamId,
          loser_team_id: loserTeamId,
          replay_url: gd.replayUrl || null,
          replay_source: gd.replayUrl ? 'showdown' : null,
        }, { withCredentials: true })

        const gameId = gameResp.data.id

        // Stats
        const stats: any[] = []
        for (const b of gd.homeBrings.filter(e => e.state !== 'none')) {
          if (!b.speciesId) continue
          stats.push({
            team_id: match.home_team_id,
            species_id: b.speciesId,
            was_brought: true,
            was_lead: b.state === 'lead',
            direct_kills: gd.killEvents.filter(ke => ke.attackerSide === 'home' && ke.attackerSpeciesId === b.speciesId && ke.killType === 'direct').length,
            passive_kills: gd.killEvents.filter(ke => ke.attackerSide === 'home' && ke.attackerSpeciesId === b.speciesId && ke.killType !== 'direct').length,
            direct_deaths: gd.killEvents.filter(ke => ke.defenderSide === 'home' && ke.defenderSpeciesId === b.speciesId && ke.killType === 'direct').length,
            passive_deaths: gd.killEvents.filter(ke => ke.defenderSide === 'home' && ke.defenderSpeciesId === b.speciesId && ke.killType !== 'direct').length,
          })
        }
        for (const b of gd.awayBrings.filter(e => e.state !== 'none')) {
          if (!b.speciesId) continue
          stats.push({
            team_id: match.away_team_id,
            species_id: b.speciesId,
            was_brought: true,
            was_lead: b.state === 'lead',
            direct_kills: gd.killEvents.filter(ke => ke.attackerSide === 'away' && ke.attackerSpeciesId === b.speciesId && ke.killType === 'direct').length,
            passive_kills: gd.killEvents.filter(ke => ke.attackerSide === 'away' && ke.attackerSpeciesId === b.speciesId && ke.killType !== 'direct').length,
            direct_deaths: gd.killEvents.filter(ke => ke.defenderSide === 'away' && ke.defenderSpeciesId === b.speciesId && ke.killType === 'direct').length,
            passive_deaths: gd.killEvents.filter(ke => ke.defenderSide === 'away' && ke.defenderSpeciesId === b.speciesId && ke.killType !== 'direct').length,
          })
        }

        if (stats.length > 0) {
          await axios.post(`/matches/${match.id}/games/${gameId}/stats`, stats, { withCredentials: true })
        }

        // Kill events
        const killPayload = gd.killEvents
          .filter(ke => ke.attackerSpeciesId && ke.defenderSpeciesId)
          .map(ke => ({
            turn_number: ke.turnNumber,
            attacker_team_id: ke.attackerSide === 'home' ? match.home_team_id : match.away_team_id,
            attacker_species_id: ke.attackerSpeciesId,
            defender_team_id: ke.defenderSide === 'home' ? match.home_team_id : match.away_team_id,
            defender_species_id: ke.defenderSpeciesId,
            move_name: ke.moveName || null,
            kill_type: ke.killType,
          }))

        if (killPayload.length > 0) {
          await axios.post(`/games/${gameId}/kill-events`, killPayload, { withCredentials: true })
        }
      }

      onComplete()
    } catch (e: any) {
      setSubmitError(e.response?.data?.detail ?? 'Submission failed')
    } finally { setSubmitting(false) }
  }

  const inp = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '6px 12px',
    color: 'var(--color-text)',
  }

  return (
    <div className="rounded-xl border p-6 space-y-6" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
      {/* Step nav */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        {[
          { key: 'score', label: 'Score' },
          ...Array.from({ length: totalGames }, (_, i) => ({ key: i + 1, label: `Game ${i + 1}` })),
          { key: 'review', label: 'Review' },
        ].map(({ key, label }, idx, arr) => (
          <span key={String(key)} className="flex items-center gap-1">
            <button
              onClick={() => {
                if (key === 'score') goToScore()
                else if (key === 'review') { if (totalGames > 0) goToReview() }
                else goToGame(key as number)
              }}
              className="px-2.5 py-1 rounded transition-all"
              style={{
                background: step === key ? 'var(--color-primary)' : 'var(--color-bg)',
                color: step === key ? '#fff' : 'var(--color-text-muted)',
                fontWeight: step === key ? 600 : 400,
                border: '1px solid var(--color-border)',
              }}>
              {label}
            </button>
            {idx < arr.length - 1 && <span style={{ color: 'var(--color-text-muted)' }}>›</span>}
          </span>
        ))}
      </div>

      {/* Step content */}
      {step === 'score' && (
        <div className="space-y-4">
          <h3 className="font-semibold">Match score</h3>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <div className="text-sm mb-2" style={{ color: homeTeam.primary_color }}>{homeTeam.name}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setHomeScore(Math.max(0, homeScore - 1))} className="w-8 h-8 rounded text-lg font-bold" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>−</button>
                <span className="text-4xl font-bold w-12 text-center">{homeScore}</span>
                <button onClick={() => setHomeScore(homeScore + 1)} className="w-8 h-8 rounded text-lg font-bold" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>+</button>
              </div>
            </div>
            <div className="text-2xl font-bold" style={{ color: 'var(--color-text-muted)' }}>–</div>
            <div className="flex-1">
              <div className="text-sm mb-2" style={{ color: awayTeam.primary_color }}>{awayTeam.name}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setAwayScore(Math.max(0, awayScore - 1))} className="w-8 h-8 rounded text-lg font-bold" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>−</button>
                <span className="text-4xl font-bold w-12 text-center">{awayScore}</span>
                <button onClick={() => setAwayScore(awayScore + 1)} className="w-8 h-8 rounded text-lg font-bold" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>+</button>
              </div>
            </div>
          </div>
          {totalGames > 0 && (
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {totalGames} game{totalGames !== 1 ? 's' : ''} to log
            </div>
          )}
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes…"
              className="w-full rounded px-3 py-2 text-sm" style={inp} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => goToGame(1)} disabled={totalGames === 0}
              className="px-4 py-2 rounded text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}>
              {totalGames === 0 ? 'Set score first' : `Next — log Game 1`}
            </button>
            <button onClick={onCancel} className="px-4 py-2 rounded text-sm" style={{ border: '1px solid var(--color-border)' }}>Cancel</button>
          </div>
        </div>
      )}

      {typeof step === 'number' && (
        <div className="space-y-4">
          <h3 className="font-semibold">Game {step}</h3>
          {gameDrafts[step - 1] && (
            <GameWizardStep
              draft={gameDrafts[step - 1]}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              onChange={next => updateGame(step - 1, next)}
            />
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={() => step > 1 ? goToGame(step - 1) : goToScore()}
              className="px-4 py-2 rounded text-sm" style={{ border: '1px solid var(--color-border)' }}>
              ← Back
            </button>
            <button onClick={() => step < totalGames ? goToGame(step + 1) : goToReview()}
              className="px-4 py-2 rounded text-sm text-white"
              style={{ background: 'var(--color-primary)' }}>
              {step < totalGames ? `Next — Game ${step + 1}` : 'Review →'}
            </button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <h3 className="font-semibold">Review</h3>
          <div className="flex items-center gap-6 text-center">
            <div className="flex-1">
              <div className="font-medium" style={{ color: homeTeam.primary_color }}>{homeTeam.name}</div>
              <div className="text-4xl font-bold mt-1">{homeScore}</div>
            </div>
            <div style={{ color: 'var(--color-text-muted)' }}>–</div>
            <div className="flex-1">
              <div className="font-medium" style={{ color: awayTeam.primary_color }}>{awayTeam.name}</div>
              <div className="text-4xl font-bold mt-1">{awayScore}</div>
            </div>
          </div>
          <div className="space-y-2">
            {gameDrafts.map(gd => (
              <div key={gd.gameNumber} className="text-sm p-3 rounded" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <span className="font-medium">Game {gd.gameNumber}</span>
                {gd.winnerSide && (
                  <span className="ml-2" style={{ color: gd.winnerSide === 'home' ? homeTeam.primary_color : awayTeam.primary_color }}>
                    → {gd.winnerSide === 'home' ? homeTeam.name : awayTeam.name} wins
                  </span>
                )}
                <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>
                  · {[...gd.homeBrings, ...gd.awayBrings].filter(b => b.state !== 'none').length} brings
                  · {gd.killEvents.length} kill events
                </span>
                {gd.replayUrl && <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>📎 replay</span>}
              </div>
            ))}
          </div>
          {submitError && <p className="text-sm text-red-500">{submitError}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={submitting}
              className="px-5 py-2 rounded text-sm text-white disabled:opacity-50"
              style={{ background: '#22c55e' }}>
              {submitting ? 'Submitting…' : 'Submit & Log Results'}
            </button>
            <button onClick={() => goToGame(totalGames)} className="px-4 py-2 rounded text-sm" style={{ border: '1px solid var(--color-border)' }}>
              ← Back
            </button>
            <button onClick={onCancel} className="px-4 py-2 rounded text-sm" style={{ border: '1px solid var(--color-border)' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── GameDisplay (Feature 3) ───────────────────────────────────────────────────

function GameDisplay({
  games, homeTeam, awayTeam,
}: {
  games: GameDetail[]
  homeTeam: TeamDetail
  awayTeam: TeamDetail
}) {
  const [activeTab, setActiveTab] = useState(0)
  if (games.length === 0) return null

  const game = games[activeTab]

  const speciesName = (id: number, teamId: number): string => {
    const team = teamId === homeTeam.id ? homeTeam : awayTeam
    return team.roster.find(r => r.species_id === id)?.species_name ?? `#${id}`
  }
  const speciesSprite = (id: number, teamId: number): string | null => {
    const team = teamId === homeTeam.id ? homeTeam : awayTeam
    return team.roster.find(r => r.species_id === id)?.species_sprite_url ?? null
  }
  const teamColor = (id: number) => id === homeTeam.id ? homeTeam.primary_color : awayTeam.primary_color
  const teamName = (id: number) => id === homeTeam.id ? homeTeam.name : awayTeam.name

  const homeBrought = game.stats.filter(s => s.team_id === homeTeam.id && s.was_brought)
  const awayBrought = game.stats.filter(s => s.team_id === awayTeam.id && s.was_brought)

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
      {/* Game tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--color-border)' }}>
        {games.map((g, i) => (
          <button key={g.id}
            onClick={() => setActiveTab(i)}
            className="px-5 py-3 text-sm font-medium transition-all"
            style={{
              background: activeTab === i ? 'var(--color-bg)' : 'transparent',
              color: activeTab === i ? 'var(--color-text)' : 'var(--color-text-muted)',
              borderBottom: activeTab === i ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}>
            Game {g.game_number}
            {g.winner_team_id && (
              <span className="ml-1.5 text-xs" style={{ color: teamColor(g.winner_team_id) }}>W</span>
            )}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-5">
        {/* Brings grid */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { team: homeTeam, brought: homeBrought },
            { team: awayTeam, brought: awayBrought },
          ].map(({ team, brought }) => (
            <div key={team.id}>
              <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                <span style={{ color: team.primary_color }}>{team.name}</span>
                {game.winner_team_id === team.id && (
                  <span className="text-xs px-1.5 py-0.5 rounded text-white" style={{ background: '#22c55e' }}>W</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {brought.length === 0 && (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No data</span>
                )}
                {brought.map(stat => {
                  const sprite = speciesSprite(stat.species_id, team.id)
                  const name = speciesName(stat.species_id, team.id)
                  const kills = stat.direct_kills + stat.passive_kills
                  const deaths = stat.direct_deaths + stat.passive_deaths
                  return (
                    <div key={stat.id} className="relative flex flex-col items-center gap-0.5 p-1 rounded"
                      style={{
                        background: 'var(--color-bg)',
                        outline: stat.was_lead ? `2px solid ${team.primary_color}` : '1px solid var(--color-border)',
                      }}>
                      {stat.was_lead && (
                        <span className="absolute top-0.5 right-0.5 text-yellow-400 text-xs">★</span>
                      )}
                      {sprite ? (
                        <img src={sprite} alt={name} style={{ width: 48, height: 48 }} />
                      ) : (
                        <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>{name.substring(0, 6)}</span>
                        </div>
                      )}
                      <span className="text-xs font-mono" style={{ fontSize: '0.65rem' }}>
                        <span style={{ color: '#22c55e' }}>{kills}K</span>
                        {' / '}
                        <span style={{ color: '#ef4444' }}>{deaths}D</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Replay link */}
        {game.replay_url && (
          <div>
            <a href={game.replay_url} target="_blank" rel="noopener noreferrer"
              className="text-sm inline-flex items-center gap-1 underline"
              style={{ color: 'var(--color-primary)' }}>
              📺 Watch replay
            </a>
          </div>
        )}

        {/* Kill timeline */}
        {game.kill_events.length > 0 && (
          <div>
            <div className="text-sm font-semibold mb-2">Kill timeline</div>
            <div className="space-y-1">
              {game.kill_events.map(ke => (
                <div key={ke.id} className="flex items-center gap-2 text-sm py-1.5 px-3 rounded"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <span className="w-10 text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>T{ke.turn_number}</span>
                  <span className="font-medium" style={{ color: teamColor(ke.attacker_team_id) }}>
                    {speciesName(ke.attacker_species_id, ke.attacker_team_id)}
                  </span>
                  {ke.move_name && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>used {ke.move_name}</span>
                  )}
                  <span style={{ color: 'var(--color-text-muted)' }}>→ KO'd</span>
                  <span className="font-medium" style={{ color: teamColor(ke.defender_team_id) }}>
                    {speciesName(ke.defender_species_id, ke.defender_team_id)}
                  </span>
                  <KillTypeBadge t={ke.kill_type} />
                </div>
              ))}
            </div>
          </div>
        )}

        {game.stats.length === 0 && game.kill_events.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
            No detailed stats submitted for this game.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { user } = useAuthStore()
  const [match, setMatch] = useState<Match | null>(null)
  const [homeTeam, setHomeTeam] = useState<TeamDetail | null>(null)
  const [awayTeam, setAwayTeam] = useState<TeamDetail | null>(null)
  const [games, setGames] = useState<GameDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirming, setConfirming] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const matchResp = await axios.get(`/matches/${matchId}`)
      const m: Match = matchResp.data
      setMatch(m)

      const [homeResp, awayResp, gamesResp] = await Promise.all([
        axios.get(`/teams/${m.home_team_id}`),
        axios.get(`/teams/${m.away_team_id}`),
        axios.get(`/matches/${matchId}/games`).catch(() => ({ data: [] })),
      ])
      setHomeTeam(homeResp.data)
      setAwayTeam(awayResp.data)
      setGames(gamesResp.data)
    } catch {
      setError('Match not found')
    } finally { setLoading(false) }
  }

  useEffect(() => { if (matchId) fetchAll() }, [matchId])

  const confirmResult = async () => {
    if (!confirm('Confirm this match result?')) return
    setConfirming(true)
    try {
      await axios.post(`/matches/${matchId}/confirm`, {}, { withCredentials: true })
      setMsg('Result confirmed!')
      fetchAll()
    } catch (e: any) {
      setMsg(e.response?.data?.detail ?? 'Failed to confirm')
    } finally { setConfirming(false) }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Loading…</div>
  if (error || !match || !homeTeam || !awayTeam) {
    return <div className="p-8 text-center text-red-500">{error || 'Match not found'}</div>
  }

  const isAdmin = user && (user.roles.includes('admin') || user.roles.includes('superadmin'))
  const canSubmit = user && match.status !== 'confirmed'

  const statusColor: Record<string, string> = {
    pending: 'var(--color-text-muted)', submitted: '#3b82f6',
    confirmed: '#22c55e', disputed: '#ef4444',
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <Link to="/schedule" className="hover:underline">Schedule</Link> / Week {match.week_number}
      </div>

      {/* Score banner */}
      <div className="rounded-xl border p-8" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 text-center">
            <Link to={`/teams/${match.home_team_id}`} className="text-xl font-bold hover:underline"
              style={{ color: homeTeam.primary_color }}>
              {homeTeam.name}
            </Link>
            <div className="text-6xl font-bold mt-3">{match.home_games_won}</div>
          </div>

          <div className="text-center space-y-2">
            <div className="text-lg font-mono" style={{ color: 'var(--color-text-muted)' }}>vs</div>
            <span className="text-sm px-2 py-1 rounded"
              style={{ background: (statusColor[match.status] ?? '#888') + '22', color: statusColor[match.status] ?? '#888' }}>
              {match.status}
            </span>
            {match.winner_team_id && (
              <div className="text-sm font-medium" style={{ color: '#22c55e' }}>
                {match.winner_team_id === homeTeam.id ? homeTeam.name : awayTeam.name} wins
              </div>
            )}
          </div>

          <div className="flex-1 text-center">
            <Link to={`/teams/${match.away_team_id}`} className="text-xl font-bold hover:underline"
              style={{ color: awayTeam.primary_color }}>
              {awayTeam.name}
            </Link>
            <div className="text-6xl font-bold mt-3">{match.away_games_won}</div>
          </div>
        </div>
        {match.notes && (
          <p className="mt-4 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>{match.notes}</p>
        )}
      </div>

      {msg && <p className={`text-sm ${msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') ? 'text-red-500' : 'text-green-500'}`}>{msg}</p>}

      {/* Action buttons */}
      {canSubmit && !showWizard && (
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => setShowWizard(true)}
            className="px-4 py-2 rounded text-white text-sm"
            style={{ background: 'var(--color-primary)' }}>
            {match.status === 'pending' ? 'Submit Result' : 'Edit / Re-submit'}
          </button>
          {match.status === 'submitted' && (
            <button onClick={confirmResult} disabled={confirming}
              className="px-4 py-2 rounded text-white text-sm disabled:opacity-50"
              style={{ background: '#22c55e' }}>
              Confirm Result
            </button>
          )}
        </div>
      )}

      {/* Wizard */}
      {showWizard && (
        <SubmitWizard
          match={match}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          onComplete={() => { setShowWizard(false); setMsg('Result submitted!'); fetchAll() }}
          onCancel={() => setShowWizard(false)}
        />
      )}

      {/* Game detail display */}
      {games.length > 0 && (
        <GameDisplay games={games} homeTeam={homeTeam} awayTeam={awayTeam} />
      )}
      {games.length === 0 && match.status === 'confirmed' && (
        <div className="text-sm text-center py-4 rounded-xl border"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          No detailed game stats submitted for this match.
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGameStore } from '@/stores/gameStore'
import { ATTR_CATEGORIES, attrColor } from '@/lib/attributeCategories'
import type { Player, PlayerPositionType, PlayerPreferredRole, PlayerArchetype, AgentArchetype, PlayerAttributes, PlayerCareerStats, NumericCareerStatKey } from '@/types/player'
import type { ContractStructure } from '@/types/contract'
import clubsJson from '@/data/clubs.json'

// ---- Constants ----

const POSITIONS: PlayerPositionType[] = ['BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF']

const POSITION_LABELS: Record<PlayerPositionType, string> = {
  BP: 'Back Pocket', FB: 'Full Back', HBF: 'Half Back Flank', CHB: 'Centre Half Back',
  W: 'Wing', IM: 'Inside Mid', OM: 'Outside Mid', RK: 'Ruckman',
  HFF: 'Half Forward Flank', CHF: 'Centre Half Forward', FP: 'Forward Pocket', FF: 'Full Forward',
}

const PREFERRED_ROLES: PlayerPreferredRole[] = [
  'inside-mid', 'outside-mid', 'wing-runner', 'lockdown-defender', 'intercept-defender',
  'rebound-defender', 'pressure-forward', 'key-forward', 'small-forward', 'ruck', 'utility',
]

const ARCHETYPES: PlayerArchetype[] = [
  'ball-winner', 'line-breaker', 'aerial-interceptor', 'stopper', 'rebounder',
  'forward-pressure', 'target-mark', 'crumber', 'tap-specialist', 'mobile-ruck',
  'two-way-utility', 'intercept-defender', 'lockdown-defender', 'rebound-defender',
  'inside-bull', 'outside-runner', 'two-way-wing', 'tap-ruck', 'lead-up-forward',
  'power-forward', 'small-pressure-forward', 'swingman',
]

const AGENT_ARCHETYPES: AgentArchetype[] = [
  'loyal', 'greedy', 'premiership-chaser', 'homebody', 'mercenary', 'risk-averse',
]

const CONTRACT_STRUCTURES: ContractStructure[] = ['flat', 'front-loaded', 'back-loaded', 'escalating']

const CLAUSE_TYPES = [
  'no-trade', 'limited-trade', 'player-option', 'team-option',
  'home-state', 'contender-only', 'vesting', 'role-promise',
] as const

const LIST_STATUSES = ['senior', 'reserves', 'injured-list'] as const

const CAREER_STAT_FIELDS: NumericCareerStatKey[] = [
  'gamesPlayed', 'goals', 'behinds', 'disposals', 'kicks', 'handballs', 'marks', 'tackles',
  'hitouts', 'contestedPossessions', 'uncontestedPossessions', 'clearances', 'insideFifties',
  'rebound50s', 'freesFor', 'freesAgainst', 'contestedMarks', 'scoreInvolvements',
  'metresGained', 'turnovers', 'intercepts', 'onePercenters', 'bounces', 'clangers',
  'goalAssists', 'aflFantasyPoints', 'superCoachPoints',
]

const STAT_LABELS: Partial<Record<NumericCareerStatKey, string>> = {
  gamesPlayed: 'Games Played', goals: 'Goals', behinds: 'Behinds', disposals: 'Disposals',
  kicks: 'Kicks', handballs: 'Handballs', marks: 'Marks', tackles: 'Tackles',
  hitouts: 'Hit-outs', contestedPossessions: 'Contested Poss.', uncontestedPossessions: 'Uncontested Poss.',
  clearances: 'Clearances', insideFifties: 'Inside 50s', rebound50s: 'Rebound 50s',
  freesFor: 'Frees For', freesAgainst: 'Frees Against', contestedMarks: 'Contested Marks',
  scoreInvolvements: 'Score Involvements', metresGained: 'Metres Gained', turnovers: 'Turnovers',
  intercepts: 'Intercepts', onePercenters: 'One Percenters', bounces: 'Bounces',
  clangers: 'Clangers', goalAssists: 'Goal Assists', aflFantasyPoints: 'AFL Fantasy Pts',
  superCoachPoints: 'SuperCoach Pts',
}

// ---- Helpers ----

function emptyCareerStats(): PlayerCareerStats {
  return {
    gamesPlayed: 0, goals: 0, behinds: 0, disposals: 0, kicks: 0, handballs: 0, marks: 0,
    tackles: 0, hitouts: 0, contestedPossessions: 0, uncontestedPossessions: 0, clearances: 0,
    insideFifties: 0, rebound50s: 0, freesFor: 0, freesAgainst: 0, contestedMarks: 0,
    scoreInvolvements: 0, metresGained: 0, turnovers: 0, intercepts: 0, onePercenters: 0,
    bounces: 0, clangers: 0, goalAssists: 0, aflFantasyPoints: 0, superCoachPoints: 0,
  }
}

function emptyAttributes(): PlayerAttributes {
  return {
    kickingEfficiency: 50, kickingDistance: 50, setShot: 50, dropPunt: 50, snap: 50,
    handballEfficiency: 50, handballDistance: 50, handballReceive: 50,
    markingOverhead: 50, markingLeading: 50, markingContested: 50, markingUncontested: 50,
    speed: 50, acceleration: 50, endurance: 50, strength: 50, agility: 50, leap: 50, recovery: 50,
    tackling: 50, contested: 50, clearance: 50, hardness: 50,
    disposalDecision: 50, fieldKicking: 50, positioning: 50, creativity: 50, anticipation: 50, composure: 50,
    goalkicking: 50, groundBallGet: 50, insideForward: 50, leadingPatterns: 50, scoringInstinct: 50,
    intercept: 50, spoiling: 50, oneOnOne: 50, zonalAwareness: 50, rebounding: 50,
    hitouts: 50, ruckCreative: 50, followUp: 50,
    pressure: 50, leadership: 50, workRate: 50, consistency: 50, determination: 50, teamPlayer: 50, clutch: 50,
    centreBounce: 50, boundaryThrowIn: 50, stoppage: 50,
  }
}

function buildDefaultPlayer(clubId: string): Omit<Player, 'id'> {
  const now = new Date()
  const birthYear = now.getFullYear() - 22
  return {
    firstName: '',
    lastName: '',
    age: 22,
    dateOfBirth: `${birthYear}-01-01`,
    clubId,
    jerseyNumber: 0,
    jumperHistory: [],
    height: 185,
    weight: 85,
    position: { primary: 'IM', secondary: [], ratings: {} },
    preferredRole: 'inside-mid',
    archetype: 'ball-winner',
    attributes: emptyAttributes(),
    hiddenAttributes: {
      potentialCeiling: 75,
      developmentRate: 1.0,
      peakAgeStart: 25,
      peakAgeEnd: 29,
      declineRate: 1.0,
      injuryProneness: 30,
      durability: 70,
      bigGameModifier: 0,
    },
    personality: { ambition: 50, loyalty: 50, professionalism: 50, temperament: 50 },
    agentArchetype: 'loyal',
    homeState: '',
    contract: {
      yearsRemaining: 2,
      aav: 400000,
      yearByYear: [400000, 400000],
      isRestricted: false,
      structure: 'flat',
      clauses: [],
    },
    morale: 70,
    fitness: 90,
    fatigue: 10,
    form: 70,
    injury: null,
    isRookie: false,
    listStatus: 'senior',
    draftYear: now.getFullYear() - 2,
    draftPick: null,
    careerStats: emptyCareerStats(),
    seasonStats: emptyCareerStats(),
    injuryHistory: [],
    suspension: null,
    suspensionHistory: [],
    tradeRequest: null,
    trainingFocus: null,
    upskillPlans: [],
    contractTier: 'afl-listed',
    stateLeagueContract: null,
    contractHistory: [],
  }
}

function generateYearByYear(years: number, aav: number, structure: ContractStructure): number[] {
  if (years <= 0) return []
  const arr: number[] = []
  for (let i = 0; i < years; i++) {
    let val = aav
    if (structure === 'front-loaded') val = Math.round(aav * (1 + (years - 1 - i) * 0.05))
    else if (structure === 'back-loaded') val = Math.round(aav * (1 + i * 0.05))
    else if (structure === 'escalating') val = Math.round(aav * (0.9 + i * 0.1))
    arr.push(val)
  }
  return arr
}

// ---- Sub-components ----

function AttrSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-36 shrink-0 text-xs">{label}</Label>
      <Slider
        min={0}
        max={100}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="flex-1"
      />
      <Input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => {
          const n = Math.max(0, Math.min(100, Number(e.target.value)))
          onChange(n)
        }}
        className={`w-14 h-7 text-center text-xs ${attrColor(value)}`}
      />
    </div>
  )
}

function StatRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="w-24 h-7 text-right text-xs"
      />
    </div>
  )
}

// ---- Main Component ----

interface PlayerEditorSheetProps {
  open: boolean
  onClose: () => void
  /** If provided, editing existing player. If null, creating new. */
  editPlayer: Player | null
  defaultClubId: string
}

export function PlayerEditorSheet({ open, onClose, editPlayer, defaultClubId }: PlayerEditorSheetProps) {
  const createCustomPlayer = useGameStore((s) => s.createCustomPlayer)
  const updatePlayerFull = useGameStore((s) => s.updatePlayerFull)
  const deleteCustomPlayer = useGameStore((s) => s.deleteCustomPlayer)

  const isEdit = Boolean(editPlayer)

  const [draft, setDraft] = useState<Omit<Player, 'id'>>(() =>
    editPlayer ? { ...editPlayer } : buildDefaultPlayer(defaultClubId),
  )
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reset draft when sheet opens/changes target
  useEffect(() => {
    if (open) {
      setDraft(editPlayer ? { ...editPlayer } : buildDefaultPlayer(defaultClubId))
      setSaveError(null)
    }
  }, [open, editPlayer, defaultClubId])

  const update = useCallback(<K extends keyof Omit<Player, 'id'>>(key: K, value: Omit<Player, 'id'>[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }, [])

  const updateAttr = useCallback((key: keyof PlayerAttributes, value: number) => {
    setDraft((prev) => ({
      ...prev,
      attributes: { ...prev.attributes, [key]: value },
    }))
  }, [])

  const handleSave = () => {
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setSaveError('First and last name are required.')
      return
    }
    if (isEdit && editPlayer) {
      const result = updatePlayerFull(editPlayer.id, draft)
      if (!result.success) { setSaveError(result.error ?? 'Unknown error.'); return }
    } else {
      createCustomPlayer(draft)
    }
    onClose()
  }

  const handleDelete = () => {
    if (editPlayer) {
      deleteCustomPlayer(editPlayer.id)
      onClose()
    }
  }

  const clubs = clubsJson as Array<{ id: string; fullName: string; abbreviation: string }>

  // ---- Contract helpers ----
  const updateContractYears = (years: number) => {
    const y = Math.max(0, Math.min(8, years))
    setDraft((prev) => ({
      ...prev,
      contract: {
        ...prev.contract,
        yearsRemaining: y,
        yearByYear: generateYearByYear(y, prev.contract.aav, (prev.contract.structure as ContractStructure) ?? 'flat'),
      },
    }))
  }
  const updateContractAav = (aav: number) => {
    setDraft((prev) => ({
      ...prev,
      contract: {
        ...prev.contract,
        aav,
        yearByYear: generateYearByYear(
          prev.contract.yearsRemaining,
          aav,
          (prev.contract.structure as ContractStructure) ?? 'flat',
        ),
      },
    }))
  }
  const updateContractStructure = (structure: ContractStructure) => {
    setDraft((prev) => ({
      ...prev,
      contract: {
        ...prev.contract,
        structure,
        yearByYear: generateYearByYear(prev.contract.yearsRemaining, prev.contract.aav, structure),
      },
    }))
  }
  const toggleClause = (clauseType: string) => {
    setDraft((prev) => {
      const clauses = prev.contract.clauses ?? []
      const exists = clauses.some((c) => c.type === clauseType)
      return {
        ...prev,
        contract: {
          ...prev.contract,
          clauses: exists
            ? clauses.filter((c) => c.type !== clauseType)
            : [...clauses, { type: clauseType as import('@/types/contract').ContractClauseType }],
        },
      }
    })
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0 gap-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetTitle>
              {isEdit
                ? `Edit: ${editPlayer!.firstName} ${editPlayer!.lastName}`
                : 'Create New Player'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Tabs defaultValue="identity" className="w-full">
              <TabsList className="flex flex-wrap gap-1 h-auto mb-4">
                <TabsTrigger value="identity">Identity</TabsTrigger>
                <TabsTrigger value="attributes">Attributes</TabsTrigger>
                <TabsTrigger value="hidden">Hidden</TabsTrigger>
                <TabsTrigger value="contract">Contract</TabsTrigger>
                <TabsTrigger value="stats">Career Stats</TabsTrigger>
                <TabsTrigger value="misc">Misc</TabsTrigger>
              </TabsList>

              {/* ---- TAB 1: IDENTITY ---- */}
              <TabsContent value="identity" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name *</Label>
                    <Input value={draft.firstName} onChange={(e) => update('firstName', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name *</Label>
                    <Input value={draft.lastName} onChange={(e) => update('lastName', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Age</Label>
                    <Input
                      type="number"
                      min={15}
                      max={45}
                      value={draft.age}
                      onChange={(e) => update('age', Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Date of Birth</Label>
                    <Input
                      type="date"
                      value={draft.dateOfBirth}
                      onChange={(e) => update('dateOfBirth', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Jersey Number</Label>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={draft.jerseyNumber}
                      onChange={(e) => update('jerseyNumber', Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Club</Label>
                    <Select value={draft.clubId} onValueChange={(v) => update('clubId', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {clubs.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">List Status</Label>
                    <Select value={draft.listStatus} onValueChange={(v) => update('listStatus', v as Player['listStatus'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LIST_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Primary Position</Label>
                    <Select
                      value={draft.position.primary}
                      onValueChange={(v) =>
                        update('position', { ...draft.position, primary: v as PlayerPositionType })
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {POSITIONS.map((p) => (
                          <SelectItem key={p} value={p}>{POSITION_LABELS[p]} ({p})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Preferred Role</Label>
                    <Select value={draft.preferredRole} onValueChange={(v) => update('preferredRole', v as PlayerPreferredRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PREFERRED_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Archetype</Label>
                    <Select value={draft.archetype} onValueChange={(v) => update('archetype', v as PlayerArchetype)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ARCHETYPES.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Draft Year</Label>
                    <Input
                      type="number"
                      value={draft.draftYear}
                      onChange={(e) => update('draftYear', Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Draft Pick</Label>
                    <Input
                      type="number"
                      min={1}
                      value={draft.draftPick ?? ''}
                      placeholder="Undrafted"
                      onChange={(e) => update('draftPick', e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Home State</Label>
                    <Input
                      value={draft.homeState ?? ''}
                      onChange={(e) => update('homeState', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Height (cm)</Label>
                    <Input
                      type="number"
                      value={draft.height}
                      onChange={(e) => update('height', Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Weight (kg)</Label>
                    <Input
                      type="number"
                      value={draft.weight}
                      onChange={(e) => update('weight', Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Label className="text-sm">Is Rookie</Label>
                  <Switch checked={draft.isRookie} onCheckedChange={(v) => update('isRookie', v)} />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Secondary Positions</Label>
                  <div className="flex flex-wrap gap-2">
                    {POSITIONS.filter((p) => p !== draft.position.primary).map((p) => {
                      const active = draft.position.secondary.includes(p)
                      return (
                        <Badge
                          key={p}
                          variant={active ? 'default' : 'outline'}
                          className="cursor-pointer select-none"
                          onClick={() => {
                            const sec = active
                              ? draft.position.secondary.filter((s) => s !== p)
                              : [...draft.position.secondary, p]
                            update('position', { ...draft.position, secondary: sec })
                          }}
                        >
                          {p}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              </TabsContent>

              {/* ---- TAB 2: ATTRIBUTES ---- */}
              <TabsContent value="attributes" className="space-y-6 mt-0">
                {ATTR_CATEGORIES.map((cat) => (
                  <div key={cat.label} className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {cat.label}
                    </h4>
                    <div className="space-y-2">
                      {cat.attrs.map(({ key, label }) => (
                        <AttrSlider
                          key={key}
                          label={label}
                          value={draft.attributes[key]}
                          onChange={(v) => updateAttr(key, v)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* ---- TAB 3: HIDDEN ATTRIBUTES ---- */}
              <TabsContent value="hidden" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label className="text-xs">Potential Ceiling (1–100)</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      min={1}
                      max={100}
                      value={[draft.hiddenAttributes.potentialCeiling]}
                      onValueChange={([v]) =>
                        setDraft((prev) => ({ ...prev, hiddenAttributes: { ...prev.hiddenAttributes, potentialCeiling: v } }))
                      }
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={draft.hiddenAttributes.potentialCeiling}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, hiddenAttributes: { ...prev.hiddenAttributes, potentialCeiling: Math.max(1, Math.min(100, Number(e.target.value))) } }))
                      }
                      className="w-14 h-7 text-center text-xs"
                    />
                  </div>
                </div>

                {(
                  [
                    ['developmentRate', 'Development Rate (0.5–2.0)', 0.5, 2.0, 0.1],
                    ['declineRate', 'Decline Rate (0.5–2.0)', 0.5, 2.0, 0.1],
                  ] as const
                ).map(([field, label, min, max, step]) => (
                  <div key={field} className="space-y-2">
                    <Label className="text-xs">{label}</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        min={min}
                        max={max}
                        step={step}
                        value={[draft.hiddenAttributes[field]]}
                        onValueChange={([v]) =>
                          setDraft((prev) => ({ ...prev, hiddenAttributes: { ...prev.hiddenAttributes, [field]: v } }))
                        }
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={draft.hiddenAttributes[field]}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, hiddenAttributes: { ...prev.hiddenAttributes, [field]: Number(e.target.value) } }))
                        }
                        className="w-16 h-7 text-center text-xs"
                      />
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Peak Age Start (20–30)</Label>
                    <Input
                      type="number"
                      min={20}
                      max={30}
                      value={draft.hiddenAttributes.peakAgeStart}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, hiddenAttributes: { ...prev.hiddenAttributes, peakAgeStart: Number(e.target.value) } }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Peak Age End (25–35)</Label>
                    <Input
                      type="number"
                      min={25}
                      max={35}
                      value={draft.hiddenAttributes.peakAgeEnd}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, hiddenAttributes: { ...prev.hiddenAttributes, peakAgeEnd: Number(e.target.value) } }))
                      }
                    />
                  </div>
                </div>

                {(
                  [
                    ['injuryProneness', 'Injury Proneness (1–100)', 1, 100, 1],
                    ['durability', 'Durability (1–100)', 1, 100, 1],
                  ] as const
                ).map(([field, label, min, max, step]) => (
                  <div key={field} className="space-y-2">
                    <Label className="text-xs">{label}</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        min={min}
                        max={max}
                        step={step}
                        value={[draft.hiddenAttributes[field]]}
                        onValueChange={([v]) =>
                          setDraft((prev) => ({ ...prev, hiddenAttributes: { ...prev.hiddenAttributes, [field]: v } }))
                        }
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={min}
                        max={max}
                        value={draft.hiddenAttributes[field]}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, hiddenAttributes: { ...prev.hiddenAttributes, [field]: Number(e.target.value) } }))
                        }
                        className="w-14 h-7 text-center text-xs"
                      />
                    </div>
                  </div>
                ))}

                <div className="space-y-2">
                  <Label className="text-xs">Big Game Modifier (−10 to +10)</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      min={-10}
                      max={10}
                      step={1}
                      value={[draft.hiddenAttributes.bigGameModifier]}
                      onValueChange={([v]) =>
                        setDraft((prev) => ({ ...prev, hiddenAttributes: { ...prev.hiddenAttributes, bigGameModifier: v } }))
                      }
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={-10}
                      max={10}
                      value={draft.hiddenAttributes.bigGameModifier}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, hiddenAttributes: { ...prev.hiddenAttributes, bigGameModifier: Math.max(-10, Math.min(10, Number(e.target.value))) } }))
                      }
                      className="w-14 h-7 text-center text-xs"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* ---- TAB 4: CONTRACT ---- */}
              <TabsContent value="contract" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Years Remaining (0–8)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={8}
                      value={draft.contract.yearsRemaining}
                      onChange={(e) => updateContractYears(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Annual Value (AAV $)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={5000}
                      value={draft.contract.aav}
                      onChange={(e) => updateContractAav(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Contract Structure</Label>
                  <Select
                    value={(draft.contract.structure as string) ?? 'flat'}
                    onValueChange={(v) => updateContractStructure(v as ContractStructure)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTRACT_STRUCTURES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {draft.contract.yearByYear.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Year-by-Year Salaries</Label>
                    {draft.contract.yearByYear.map((val, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground w-16 shrink-0">Year {i + 1}</Label>
                        <Input
                          type="number"
                          min={0}
                          step={5000}
                          value={val}
                          onChange={(e) => {
                            const updated = [...draft.contract.yearByYear]
                            updated[i] = Number(e.target.value)
                            setDraft((prev) => ({ ...prev, contract: { ...prev.contract, yearByYear: updated } }))
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Label className="text-sm">Restricted Free Agent</Label>
                  <Switch
                    checked={draft.contract.isRestricted}
                    onCheckedChange={(v) =>
                      setDraft((prev) => ({ ...prev, contract: { ...prev.contract, isRestricted: v } }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Contract Clauses</Label>
                  <div className="flex flex-wrap gap-2">
                    {CLAUSE_TYPES.map((clauseType) => {
                      const active = (draft.contract.clauses ?? []).some((c) => c.type === clauseType)
                      return (
                        <Badge
                          key={clauseType}
                          variant={active ? 'default' : 'outline'}
                          className="cursor-pointer select-none"
                          onClick={() => toggleClause(clauseType)}
                        >
                          {clauseType}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              </TabsContent>

              {/* ---- TAB 5: CAREER STATS ---- */}
              <TabsContent value="stats" className="space-y-6 mt-0">
                <div>
                  <h4 className="text-sm font-semibold mb-3">Career Totals</h4>
                  <div className="space-y-2">
                    {CAREER_STAT_FIELDS.map((field) => (
                      <StatRow
                        key={`career-${field}`}
                        label={STAT_LABELS[field] ?? field}
                        value={draft.careerStats[field]}
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            careerStats: { ...prev.careerStats, [field]: v },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-3">This Season</h4>
                  <div className="space-y-2">
                    {CAREER_STAT_FIELDS.map((field) => (
                      <StatRow
                        key={`season-${field}`}
                        label={STAT_LABELS[field] ?? field}
                        value={draft.seasonStats[field]}
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            seasonStats: { ...prev.seasonStats, [field]: v },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* ---- TAB 6: MISC ---- */}
              <TabsContent value="misc" className="space-y-4 mt-0">
                {(
                  [
                    ['morale', 'Morale'],
                    ['fitness', 'Fitness'],
                    ['fatigue', 'Fatigue'],
                    ['form', 'Form'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="space-y-2">
                    <Label className="text-xs">{label}</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        min={0}
                        max={100}
                        value={[draft[field]]}
                        onValueChange={([v]) => update(field, v)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={draft[field]}
                        onChange={(e) => update(field, Math.max(0, Math.min(100, Number(e.target.value))))}
                        className="w-14 h-7 text-center text-xs"
                      />
                    </div>
                  </div>
                ))}

                <div className="pt-2 space-y-4">
                  <h4 className="text-sm font-semibold">Personality</h4>
                  {(
                    [
                      ['ambition', 'Ambition'],
                      ['loyalty', 'Loyalty'],
                      ['professionalism', 'Professionalism'],
                      ['temperament', 'Temperament'],
                    ] as const
                  ).map(([field, label]) => (
                    <div key={field} className="space-y-2">
                      <Label className="text-xs">{label}</Label>
                      <div className="flex items-center gap-2">
                        <Slider
                          min={1}
                          max={100}
                          value={[draft.personality[field]]}
                          onValueChange={([v]) =>
                            setDraft((prev) => ({ ...prev, personality: { ...prev.personality, [field]: v } }))
                          }
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={draft.personality[field]}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              personality: { ...prev.personality, [field]: Math.max(1, Math.min(100, Number(e.target.value))) },
                            }))
                          }
                          className="w-14 h-7 text-center text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 pt-2">
                  <Label className="text-xs">Agent Archetype</Label>
                  <Select
                    value={draft.agentArchetype ?? 'loyal'}
                    onValueChange={(v) => update('agentArchetype', v as AgentArchetype)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AGENT_ARCHETYPES.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <SheetFooter className="px-6 py-4 border-t shrink-0 flex-row justify-between gap-2">
            <div>
              {isEdit && (
                <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                  Delete Player
                </Button>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {saveError && <span className="text-xs text-destructive">{saveError}</span>}
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave}>{isEdit ? 'Save Changes' : 'Create Player'}</Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Player?</DialogTitle>
            <DialogDescription>
              This will permanently remove {editPlayer?.firstName} {editPlayer?.lastName} from the game.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

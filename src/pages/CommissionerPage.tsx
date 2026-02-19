import { useState, useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertTriangle, Shield, Zap, Users, ArrowRightLeft, Building2,
  Wrench, RotateCcw, ListX, RefreshCw, Skull, CheckCircle2, XCircle,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getOverallRating } from '@/engine/player/playerRating'
import { DEFAULT_REALISM } from '@/engine/core/defaultSettings'
import type { Player, PlayerAttributes } from '@/types/player'
import type { Club } from '@/types/club'
import type { RealismSettings } from '@/types/game'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtM(n: number) {
  return `$${(n / 1_000_000).toFixed(2)}M`
}

function capPct(spend: number, cap: number) {
  return cap > 0 ? Math.round((spend / cap) * 100) : 0
}

// ---------------------------------------------------------------------------
// Attribute groups for the player editor
// ---------------------------------------------------------------------------

type AttrKey = keyof PlayerAttributes

const ATTR_GROUPS: Array<{ label: string; keys: AttrKey[] }> = [
  {
    label: 'Kicking',
    keys: ['kickingEfficiency', 'kickingDistance', 'fieldKicking', 'setShot', 'dropPunt', 'snap'],
  },
  {
    label: 'Handball',
    keys: ['handballEfficiency', 'handballDistance', 'handballReceive'],
  },
  {
    label: 'Marking',
    keys: ['markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested'],
  },
  {
    label: 'Physical',
    keys: ['speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery'],
  },
  {
    label: 'Contested',
    keys: ['tackling', 'contested', 'clearance', 'hardness', 'stoppage', 'centreBounce'],
  },
  {
    label: 'Game Sense',
    keys: ['disposalDecision', 'positioning', 'creativity', 'anticipation', 'composure'],
  },
  {
    label: 'Offensive',
    keys: ['goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct'],
  },
  {
    label: 'Defensive',
    keys: ['intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding'],
  },
  {
    label: 'Ruck',
    keys: ['hitouts', 'ruckCreative', 'followUp'],
  },
  {
    label: 'Mental',
    keys: ['pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch'],
  },
]

function attrLabel(key: AttrKey): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
}

// ---------------------------------------------------------------------------
// Player Edit Dialog
// ---------------------------------------------------------------------------

interface PlayerEditState {
  morale: number
  fitness: number
  fatigue: number
  form: number
  aav: number
  yearsRemaining: number
  injuryWeeks: number
  targetClubId: string
  attrs: PlayerAttributes
}

function PlayerEditDialog({
  player,
  clubs,
  onClose,
}: {
  player: Player
  clubs: Record<string, Club>
  onClose: () => void
}) {
  const updatePlayer = useGameStore((s) => s.updatePlayer)
  const forceTrade = useGameStore((s) => s.forceTrade)
  const forceSetPlayerInjury = useGameStore((s) => s.forceSetPlayerInjury)
  const clearPlayerInjury = useGameStore((s) => s.clearPlayerInjury)
  const forceSetPlayerContract = useGameStore((s) => s.forceSetPlayerContract)

  const [tab, setTab] = useState<'status' | 'attrs' | 'contract' | 'move'>('status')
  const [draft, setDraft] = useState<PlayerEditState>({
    morale: player.morale,
    fitness: player.fitness,
    fatigue: player.fatigue ?? 0,
    form: player.form,
    aav: player.contract.aav,
    yearsRemaining: player.contract.yearsRemaining,
    injuryWeeks: 4,
    targetClubId: '',
    attrs: { ...player.attributes },
  })

  const handleApply = () => {
    if (tab === 'status') {
      updatePlayer(player.id, {
        morale: draft.morale,
        fitness: draft.fitness,
        fatigue: draft.fatigue,
        form: draft.form,
      })
    } else if (tab === 'attrs') {
      updatePlayer(player.id, { attributes: { ...draft.attrs } })
    } else if (tab === 'contract') {
      forceSetPlayerContract(player.id, draft.aav, draft.yearsRemaining)
    } else if (tab === 'move' && draft.targetClubId) {
      forceTrade([player.id], draft.targetClubId)
    }
    onClose()
  }

  const clubList = Object.values(clubs).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {player.firstName} {player.lastName}
          </DialogTitle>
          <DialogDescription>
            {player.position.primary} · {clubs[player.clubId]?.name ?? player.clubId} · Age {player.age}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="attrs">Attributes</TabsTrigger>
            <TabsTrigger value="contract">Contract</TabsTrigger>
            <TabsTrigger value="move">Move</TabsTrigger>
          </TabsList>

          {/* Status */}
          <TabsContent value="status" className="space-y-4 mt-4">
            {(
              [
                ['morale', 'Morale', 0, 100],
                ['fitness', 'Fitness', 0, 100],
                ['fatigue', 'Fatigue', 0, 100],
                ['form', 'Form', 0, 100],
              ] as const
            ).map(([key, label, min, max]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <Label>{label}</Label>
                  <span className="font-mono text-muted-foreground">{draft[key]}</span>
                </div>
                <Slider
                  min={min}
                  max={max}
                  step={1}
                  value={[draft[key]]}
                  onValueChange={([v]) => setDraft((d) => ({ ...d, [key]: v }))}
                />
              </div>
            ))}

            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Injury</p>
              {player.injury ? (
                <div className="flex items-center gap-3">
                  <Badge variant="destructive" className="text-xs">
                    {player.injury.type} — {player.injury.weeksRemaining}w
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => { clearPlayerInjury(player.id); onClose() }}>
                    Clear Injury
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={52}
                    value={draft.injuryWeeks}
                    onChange={(e) => setDraft((d) => ({ ...d, injuryWeeks: Math.max(1, Number(e.target.value)) }))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">weeks</span>
                  <Button size="sm" variant="destructive" onClick={() => { forceSetPlayerInjury(player.id, draft.injuryWeeks); onClose() }}>
                    Add Injury
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Attributes */}
          <TabsContent value="attrs" className="mt-4 space-y-4">
            {ATTR_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
                  {group.keys.map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex-1 truncate">{attrLabel(key)}</span>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={draft.attrs[key]}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(99, Number(e.target.value)))
                          setDraft((d) => ({ ...d, attrs: { ...d.attrs, [key]: val } }))
                        }}
                        className="w-16 h-7 text-xs text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* Contract */}
          <TabsContent value="contract" className="mt-4 space-y-4">
            <div className="space-y-1">
              <Label>Annual Value (AAV)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={0}
                  step={50000}
                  value={draft.aav}
                  onChange={(e) => setDraft((d) => ({ ...d, aav: Number(e.target.value) }))}
                  className="w-40"
                />
                <span className="text-sm text-muted-foreground">= {fmtM(draft.aav)}/yr</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Years Remaining</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={draft.yearsRemaining}
                onChange={(e) => setDraft((d) => ({ ...d, yearsRemaining: Number(e.target.value) }))}
                className="w-24"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Current: {fmtM(player.contract.aav)}/yr · {player.contract.yearsRemaining} yr left
            </p>
          </TabsContent>

          {/* Move */}
          <TabsContent value="move" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Instantly transfer this player to another club. Salary cap spend will be recalculated for both clubs.
            </p>
            <div className="space-y-1">
              <Label>Move to Club</Label>
              <Select value={draft.targetClubId} onValueChange={(v) => setDraft((d) => ({ ...d, targetClubId: v }))}>
                <SelectTrigger className="w-60">
                  <SelectValue placeholder="Select club…" />
                </SelectTrigger>
                <SelectContent>
                  {clubList
                    .filter((c) => c.id !== player.clubId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleApply}
            disabled={tab === 'move' && !draft.targetClubId}
          >
            {tab === 'move' ? 'Execute Transfer' : 'Apply Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Club Edit Dialog
// ---------------------------------------------------------------------------

function ClubEditDialog({
  clubId,
  onClose,
}: {
  clubId: string
  onClose: () => void
}) {
  const club = useGameStore((s) => s.clubs[clubId])
  const players = useGameStore((s) => s.players)
  const setClubBalance = useGameStore((s) => s.setClubBalance)
  const setClubSalaryCap = useGameStore((s) => s.setClubSalaryCap)
  const setClubFanSatisfaction = useGameStore((s) => s.setClubFanSatisfaction)
  const setClubCultureScore = useGameStore((s) => s.setClubCultureScore)
  const settings = useGameStore((s) => s.settings)

  const [balance, setBalance] = useState(club?.finances.balance ?? 0)
  const [cap, setCap] = useState(club?.finances.salaryCap ?? settings.salaryCapAmount)
  const [fanSat, setFanSat] = useState(club?.fanSatisfaction ?? 50)
  const [culture, setCulture] = useState(club?.culture?.score ?? 50)

  if (!club) return null

  const clubPlayers = Object.values(players).filter((p) => p.clubId === clubId)
  const spend = clubPlayers.reduce((s, p) => s + p.contract.aav, 0)

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {club.name}</DialogTitle>
          <DialogDescription>
            Direct club data overrides
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Cash Balance</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                step={100000}
                value={balance}
                onChange={(e) => setBalance(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">{fmtM(balance)}</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Salary Cap</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                step={100000}
                value={cap}
                onChange={(e) => setCap(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">{fmtM(cap)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Current spend: {fmtM(spend)} ({capPct(spend, cap)}% of cap)
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <Label>Fan Satisfaction</Label>
              <span className="font-mono text-muted-foreground">{fanSat}</span>
            </div>
            <Slider min={0} max={100} step={1} value={[fanSat]} onValueChange={([v]) => setFanSat(v)} />
          </div>
          {club.culture && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <Label>Culture Score</Label>
                <span className="font-mono text-muted-foreground">{culture}</span>
              </div>
              <Slider min={0} max={100} step={1} value={[culture]} onValueChange={([v]) => setCulture(v)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => {
            setClubBalance(clubId, balance)
            setClubSalaryCap(clubId, cap)
            setClubFanSatisfaction(clubId, fanSat)
            setClubCultureScore(clubId, culture)
            onClose()
          }}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Realism toggle row
// ---------------------------------------------------------------------------

interface RealismRowProps {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
}

function RealismRow({ label, description, value, onChange }: RealismRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function CommissionerPage() {
  const settings = useGameStore((s) => s.settings)
  const clubs = useGameStore((s) => s.clubs)
  const players = useGameStore((s) => s.players)
  const ladder = useGameStore((s) => s.ladder)
  const phase = useGameStore((s) => s.phase)
  const currentYear = useGameStore((s) => s.currentYear)
  const currentRound = useGameStore((s) => s.currentRound)
  const updateGameSettings = useGameStore((s) => s.updateGameSettings)
  const simToEnd = useGameStore((s) => s.simToEnd)
  const simulation = useGameStore((s) => s.simulation)
  const forceTrade = useGameStore((s) => s.forceTrade)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const tradeHistory = useGameStore((s) => s.tradeHistory)
  const forceRetirePlayer = useGameStore((s) => s.forceRetirePlayer)
  const regenerateFixture = useGameStore((s) => s.regenerateFixture)
  const fixListViolations = useGameStore((s) => s.fixListViolations)
  const repairSaveState = useGameStore((s) => s.repairSaveState)
  const undoLastTrade = useGameStore((s) => s.undoLastTrade)

  const commissionerMode = settings.commissionerMode ?? false

  // Player search / filter
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerClubFilter, setPlayerClubFilter] = useState('all')
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)

  // Force trade
  const [tradeFromClub, setTradeFromClub] = useState('')
  const [tradeToClub, setTradeToClub] = useState('')
  const [tradeSelectedPlayers, setTradeSelectedPlayers] = useState<Set<string>>(new Set())
  const [tradeResult, setTradeResult] = useState<string | null>(null)

  // Club editor
  const [editingClubId, setEditingClubId] = useState<string | null>(null)

  // Maintenance tab state
  const [retireSearch, setRetireSearch] = useState('')
  const [retireConfirm, setRetireConfirm] = useState<Player | null>(null)
  const [listViolationClub, setListViolationClub] = useState('all')
  const [listViolationResult, setListViolationResult] = useState<{ fixed: number; details: string[] } | null>(null)
  const [repairResult, setRepairResult] = useState<{ fixed: number; details: string[] } | null>(null)
  const [fixtureResult, setFixtureResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [showUndoTradeConfirm, setShowUndoTradeConfirm] = useState(false)
  const [undoTradeResult, setUndoTradeResult] = useState<string | null>(null)
  const [showRepairConfirm, setShowRepairConfirm] = useState(false)
  const [showFixListConfirm, setShowFixListConfirm] = useState(false)

  const clubList = useMemo(
    () => Object.values(clubs).sort((a, b) => a.name.localeCompare(b.name)),
    [clubs],
  )

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.toLowerCase()
    return Object.values(players)
      .filter((p) => {
        if (playerClubFilter !== 'all' && p.clubId !== playerClubFilter) return false
        if (q && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))
      .slice(0, 100)
  }, [players, playerSearch, playerClubFilter])

  const tradeFromPlayers = useMemo(
    () => tradeFromClub ? Object.values(players).filter((p) => p.clubId === tradeFromClub) : [],
    [players, tradeFromClub],
  )

  const clubTableData = useMemo(() => {
    return Object.values(clubs).map((club) => {
      const clubPlayers = Object.values(players).filter((p) => p.clubId === club.id)
      const spend = clubPlayers.reduce((s, p) => s + p.contract.aav, 0)
      const ladderPos = ladder.findIndex((e) => e.clubId === club.id) + 1
      return { club, spend, ladderPos }
    }).sort((a, b) => (a.ladderPos || 99) - (b.ladderPos || 99))
  }, [clubs, players, ladder])

  const retireSearchPlayers = useMemo(() => {
    const q = retireSearch.toLowerCase()
    if (!q) return []
    return Object.values(players)
      .filter((p) => p.clubId !== 'retired' && p.clubId !== 'free-agent' && `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
      .sort((a, b) => getOverallRating(b) - getOverallRating(a))
      .slice(0, 20)
  }, [players, retireSearch])

  const listViolations = useMemo(() => {
    const result: Array<{ club: Club; seniorCount: number; seniorLimit: number; rookieCount: number; rookieLimit: number }> = []
    const seniorLimit = settings.listRules.seniorListSize
    const rookieLimit = settings.listRules.rookieListSize
    const targetClubs = listViolationClub === 'all' ? Object.values(clubs) : [clubs[listViolationClub]].filter(Boolean) as Club[]
    for (const club of targetClubs) {
      const cp = Object.values(players).filter((p) => p.clubId === club.id)
      const seniorCount = cp.filter((p) => !p.isRookie).length
      const rookieCount = cp.filter((p) => p.isRookie).length
      if (seniorCount > seniorLimit || rookieCount > rookieLimit) {
        result.push({ club, seniorCount, seniorLimit, rookieCount, rookieLimit })
      }
    }
    return result
  }, [clubs, players, settings.listRules, listViolationClub])

  const setRealism = (key: keyof RealismSettings, val: boolean) => {
    updateGameSettings({ realism: { ...settings.realism, [key]: val } })
  }

  const nukeRealism = () => {
    const off = Object.fromEntries(
      Object.keys(settings.realism).map((k) => [k, false]),
    ) as unknown as RealismSettings
    updateGameSettings({ realism: off })
  }

  const restoreRealism = () => {
    updateGameSettings({ realism: { ...DEFAULT_REALISM } })
  }

  const handleExecuteTrade = () => {
    if (!tradeToClub || tradeSelectedPlayers.size === 0) return
    forceTrade([...tradeSelectedPlayers], tradeToClub)
    const names = [...tradeSelectedPlayers]
      .map((id) => {
        const p = players[id]
        return p ? `${p.firstName} ${p.lastName}` : id
      })
      .join(', ')
    setTradeResult(`Transferred ${names} → ${clubs[tradeToClub]?.name ?? tradeToClub}`)
    setTradeSelectedPlayers(new Set())
  }

  const formatPhase = (p: string) =>
    p.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  if (!commissionerMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <Shield className="h-16 w-16 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold mb-2">Commissioner Mode</h1>
          <p className="text-muted-foreground max-w-md">
            Unlock direct editing of players, force trades, rule overrides, and fast-forward
            simulation tools. Changes made in this mode cannot be easily reversed.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-5 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-400 text-left">
            Commissioner mode bypasses normal game rules. Enabling it may affect save integrity.
          </p>
        </div>
        <Button onClick={() => updateGameSettings({ commissionerMode: true })}>
          <Shield className="mr-2 h-4 w-4" />
          Enable Commissioner Mode
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Commissioner Mode</h1>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">Active</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {currentYear} · {formatPhase(phase)} · Round {currentRound}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => updateGameSettings({ commissionerMode: false })}
        >
          Disable
        </Button>
      </div>

      <Tabs defaultValue="tools">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="tools">
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Tools
          </TabsTrigger>
          <TabsTrigger value="players">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Players
          </TabsTrigger>
          <TabsTrigger value="trades">
            <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
            Force Trade
          </TabsTrigger>
          <TabsTrigger value="clubs">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            Clubs
          </TabsTrigger>
          <TabsTrigger value="maintenance">
            <Wrench className="h-3.5 w-3.5 mr-1.5" />
            Maintenance
          </TabsTrigger>
        </TabsList>

        {/* ── TOOLS ── */}
        <TabsContent value="tools" className="mt-4 space-y-4">
          {/* Season simulation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Season Simulation</CardTitle>
              <CardDescription>
                Fast-forward the current season using AI decisions for all teams including yours.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                onClick={simToEnd}
                disabled={simulation.active || phase !== 'regular-season'}
                className="gap-2"
              >
                <Zap className="h-4 w-4" />
                Sim Rest of Season
              </Button>
              {phase !== 'regular-season' && (
                <p className="text-xs text-muted-foreground self-center">
                  Only available during regular season (current: {formatPhase(phase)})
                </p>
              )}
            </CardContent>
          </Card>

          {/* Salary cap */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">League-Wide Rules</CardTitle>
              <CardDescription>Override core rules for all clubs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Salary Cap Enforcement</p>
                  <p className="text-xs text-muted-foreground">When off, clubs can sign players beyond the cap limit</p>
                </div>
                <Switch
                  checked={settings.salaryCap}
                  onCheckedChange={(v) => updateGameSettings({ salaryCap: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Injuries</p>
                  <p className="text-xs text-muted-foreground">Toggle all match injuries on/off</p>
                </div>
                <Switch
                  checked={settings.injuriesEnabled}
                  onCheckedChange={(v) => updateGameSettings({ injuriesEnabled: v })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Realism overrides */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Realism Overrides</CardTitle>
              <CardDescription>
                Fine-tune individual simulation systems. Or go nuclear.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2 mb-3">
                <Button size="sm" variant="destructive" onClick={nukeRealism}>
                  Disable All Realism
                </Button>
                <Button size="sm" variant="outline" onClick={restoreRealism}>
                  Restore Defaults
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Player Behaviour</p>
                  <RealismRow label="Player Loyalty" description="Loyalty discounts & trade reluctance" value={settings.realism.playerLoyalty} onChange={(v) => setRealism('playerLoyalty', v)} />
                  <RealismRow label="Trade Requests" description="Unhappy players request trades" value={settings.realism.tradeRequests} onChange={(v) => setRealism('tradeRequests', v)} />
                  <RealismRow label="Players Refuse Trades" description="Players can reject moves to unsuitable clubs" value={settings.realism.playersRefuseTrades} onChange={(v) => setRealism('playersRefuseTrades', v)} />
                  <RealismRow label="Role Disputes" description="Morale hit when played out of position" value={settings.realism.playerRoleDisputes} onChange={(v) => setRealism('playerRoleDisputes', v)} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">League Operations</p>
                  <RealismRow label="Board Pressure" description="Board expectations affect job security" value={settings.realism.boardPressure} onChange={(v) => setRealism('boardPressure', v)} />
                  <RealismRow label="Board Politics" description="Factions amplify or soften pressure" value={settings.realism.boardPolitics} onChange={(v) => setRealism('boardPolitics', v)} />
                  <RealismRow label="List Size Enforcement" description="Enforce senior/rookie list limits" value={settings.realism.listSizeEnforcement} onChange={(v) => setRealism('listSizeEnforcement', v)} />
                  <RealismRow label="Negotiation Delays" description="Multi-round contract negotiation rounds" value={settings.realism.negotiationDelays} onChange={(v) => setRealism('negotiationDelays', v)} />
                  <RealismRow label="AFL House Interference" description="AFL priority picks & mandated scheduling" value={settings.realism.aflHouseInterference} onChange={(v) => setRealism('aflHouseInterference', v)} />
                  <RealismRow label="Media Leaks" description="Managers leak negotiations to the press" value={settings.realism.mediaLeaks} onChange={(v) => setRealism('mediaLeaks', v)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PLAYERS ── */}
        <TabsContent value="players" className="mt-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Search by name…"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              className="w-52"
            />
            <Select value={playerClubFilter} onValueChange={setPlayerClubFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All clubs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clubs</SelectItem>
                {clubList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground self-center">
              Showing {filteredPlayers.length} of {Object.keys(players).length} players. Click a row to edit.
            </p>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead className="text-center">Pos</TableHead>
                    <TableHead className="text-center">OVR</TableHead>
                    <TableHead className="text-center hidden sm:table-cell">Age</TableHead>
                    <TableHead className="text-right hidden md:table-cell">AAV</TableHead>
                    <TableHead className="text-center hidden sm:table-cell">Yrs</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Morale</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Fitness</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Inj</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlayers.map((p) => {
                    const isUser = p.clubId === playerClubId
                    const overall = getOverallRating(p)
                    return (
                      <TableRow
                        key={p.id}
                        className={`cursor-pointer hover:bg-accent/50 ${isUser ? 'bg-accent/20' : ''}`}
                        onClick={() => setEditingPlayer(p)}
                      >
                        <TableCell className="font-medium text-sm">
                          {p.firstName} {p.lastName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {clubs[p.clubId]?.abbreviation ?? p.clubId}
                        </TableCell>
                        <TableCell className="text-center text-xs">{p.position.primary}</TableCell>
                        <TableCell className="text-center font-bold tabular-nums">{overall}</TableCell>
                        <TableCell className="text-center text-muted-foreground hidden sm:table-cell">
                          {p.age}
                        </TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell">
                          {fmtM(p.contract.aav)}
                        </TableCell>
                        <TableCell className="text-center text-xs hidden sm:table-cell">
                          {p.contract.yearsRemaining}
                        </TableCell>
                        <TableCell className="text-center text-xs hidden lg:table-cell">
                          <span className={p.morale < 40 ? 'text-red-500' : p.morale >= 70 ? 'text-emerald-500' : ''}>
                            {p.morale}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs hidden lg:table-cell">
                          {p.fitness}
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          {p.injury ? (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">
                              {p.injury.weeksRemaining}w
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FORCE TRADE ── */}
        <TabsContent value="trades" className="mt-4 space-y-4">
          {tradeResult && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-400">
              {tradeResult}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* From */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">From Club</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={tradeFromClub} onValueChange={(v) => { setTradeFromClub(v); setTradeSelectedPlayers(new Set()) }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source club…" />
                  </SelectTrigger>
                  <SelectContent>
                    {clubList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {tradeFromClub && (
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {tradeFromPlayers
                      .sort((a, b) => getOverallRating(b) - getOverallRating(a))
                      .map((p) => (
                        <label
                          key={p.id}
                          className={`flex items-center gap-2 rounded px-2 py-1 cursor-pointer hover:bg-accent/50 text-sm ${tradeSelectedPlayers.has(p.id) ? 'bg-accent' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={tradeSelectedPlayers.has(p.id)}
                            onChange={(e) => {
                              const next = new Set(tradeSelectedPlayers)
                              if (e.target.checked) next.add(p.id)
                              else next.delete(p.id)
                              setTradeSelectedPlayers(next)
                              setTradeResult(null)
                            }}
                            className="accent-primary"
                          />
                          <span className="flex-1 truncate">
                            {p.firstName} {p.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground">{p.position.primary}</span>
                          <span className="text-xs font-bold tabular-nums">{getOverallRating(p)}</span>
                        </label>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* To */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">To Club</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={tradeToClub} onValueChange={setTradeToClub}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination club…" />
                  </SelectTrigger>
                  <SelectContent>
                    {clubList
                      .filter((c) => c.id !== tradeFromClub)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground min-h-16">
                  {tradeSelectedPlayers.size === 0 ? (
                    'Select players from the left panel'
                  ) : (
                    <ul className="space-y-0.5">
                      {[...tradeSelectedPlayers].map((id) => {
                        const p = players[id]
                        return p ? (
                          <li key={id}>
                            {p.firstName} {p.lastName}{' '}
                            <span className="text-xs text-muted-foreground">({p.position.primary})</span>
                          </li>
                        ) : null
                      })}
                    </ul>
                  )}
                </div>

                <Button
                  onClick={handleExecuteTrade}
                  disabled={!tradeToClub || tradeSelectedPlayers.size === 0}
                  className="w-full gap-2"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Execute Transfer ({tradeSelectedPlayers.size} player
                  {tradeSelectedPlayers.size !== 1 ? 's' : ''})
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── CLUBS ── */}
        <TabsContent value="clubs" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Cap</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="hidden md:table-cell">Usage</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Fan Sat</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Culture</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clubTableData.map(({ club, spend, ladderPos }) => {
                    const cap = club.finances.salaryCap
                    const pct = capPct(spend, cap)
                    return (
                      <TableRow
                        key={club.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => setEditingClubId(club.id)}
                      >
                        <TableCell className="text-center text-muted-foreground">{ladderPos || '—'}</TableCell>
                        <TableCell className="font-medium">{club.name}</TableCell>
                        <TableCell className={`text-right text-xs ${club.finances.balance < 0 ? 'text-red-500' : ''}`}>
                          {fmtM(club.finances.balance)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground hidden sm:table-cell">
                          {fmtM(cap)}
                        </TableCell>
                        <TableCell className="text-right text-xs">{fmtM(spend)}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct > 90 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums">{pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-xs hidden lg:table-cell">
                          {club.fanSatisfaction ?? '—'}
                        </TableCell>
                        <TableCell className="text-center text-xs hidden lg:table-cell">
                          {club.culture?.score ?? '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── MAINTENANCE ── */}
        <TabsContent value="maintenance" className="mt-4 space-y-4">

          {/* Force Retire */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Skull className="h-4 w-4 text-rose-400" />
                Force Retirement
              </CardTitle>
              <CardDescription>
                Instantly retire any player — they will be removed from their club list and cap.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Search player to retire…"
                value={retireSearch}
                onChange={(e) => setRetireSearch(e.target.value)}
                className="w-64"
              />
              {retireSearchPlayers.length > 0 && (
                <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                  {retireSearchPlayers.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-1.5 text-sm hover:bg-accent/40">
                      <span className="flex-1">
                        {p.firstName} {p.lastName}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {p.position.primary} · {clubs[p.clubId]?.abbreviation ?? p.clubId} · OVR {getOverallRating(p)}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 px-2 text-xs"
                        onClick={() => setRetireConfirm(p)}
                      >
                        Retire
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fix List Violations */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListX className="h-4 w-4 text-amber-400" />
                Fix List Violations
              </CardTitle>
              <CardDescription>
                Detect and auto-fix clubs exceeding their senior or rookie list limits.
                Excess players (worst-rated first) will be delisted to free agency.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap items-center">
                <Select value={listViolationClub} onValueChange={setListViolationClub}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clubs</SelectItem>
                    {clubList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {listViolations.length > 0 ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {listViolations.length} violation{listViolations.length !== 1 ? 's' : ''}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    No violations
                  </Badge>
                )}
              </div>

              {listViolations.length > 0 && (
                <div className="rounded-md border divide-y text-sm">
                  {listViolations.map(({ club, seniorCount, seniorLimit, rookieCount, rookieLimit }) => (
                    <div key={club.id} className="flex items-center gap-3 px-3 py-1.5">
                      <span className="flex-1 font-medium">{club.name}</span>
                      {seniorCount > seniorLimit && (
                        <span className="text-xs text-destructive">
                          Senior: {seniorCount}/{seniorLimit} (+{seniorCount - seniorLimit})
                        </span>
                      )}
                      {rookieCount > rookieLimit && (
                        <span className="text-xs text-destructive">
                          Rookie: {rookieCount}/{rookieLimit} (+{rookieCount - rookieLimit})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {listViolationResult && (
                <div className={`rounded-md border px-3 py-2 text-sm ${listViolationResult.fixed > 0 ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' : 'border-border text-muted-foreground'}`}>
                  {listViolationResult.fixed === 0
                    ? 'No violations found — all lists are within limits.'
                    : `Fixed ${listViolationResult.fixed} violation${listViolationResult.fixed !== 1 ? 's' : ''}.`}
                </div>
              )}

              <Button
                variant="destructive"
                size="sm"
                disabled={listViolations.length === 0}
                onClick={() => setShowFixListConfirm(true)}
                className="gap-2"
              >
                <ListX className="h-4 w-4" />
                Fix {listViolations.length > 0 ? `${listViolations.length} Violation${listViolations.length !== 1 ? 's' : ''}` : 'Violations'}
              </Button>
            </CardContent>
          </Card>

          {/* Regenerate Fixture */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-blue-400" />
                Regenerate Fixture
              </CardTitle>
              <CardDescription>
                Generate a brand-new fixture schedule using the current clubs and settings.
                Only available before round 1 has been played.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {fixtureResult && (
                <div className={`rounded-md border px-3 py-2 text-sm ${fixtureResult.success ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
                  {fixtureResult.success
                    ? <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />{fixtureResult.message}</span>
                    : <span className="flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5" />{fixtureResult.message}</span>}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRegenerateConfirm(true)}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate Fixture
              </Button>
            </CardContent>
          </Card>

          {/* Undo Last Trade */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-indigo-400" />
                Undo Last Trade
              </CardTitle>
              <CardDescription>
                Reverses the most recent completed trade — moves players back to their original clubs
                and recalculates salary cap spend for both clubs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tradeHistory && tradeHistory.length > 0 ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm space-y-0.5">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Last trade</p>
                  <p>
                    {clubs[tradeHistory[tradeHistory.length - 1].clubA]?.name ?? tradeHistory[tradeHistory.length - 1].clubA}
                    {' ↔ '}
                    {clubs[tradeHistory[tradeHistory.length - 1].clubB]?.name ?? tradeHistory[tradeHistory.length - 1].clubB}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tradeHistory[tradeHistory.length - 1].date).toLocaleDateString('en-AU')}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No trades in history.</p>
              )}
              {undoTradeResult && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-400">
                  {undoTradeResult}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={!tradeHistory || tradeHistory.length === 0}
                onClick={() => setShowUndoTradeConfirm(true)}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Undo Last Trade
              </Button>
            </CardContent>
          </Card>

          {/* Repair Save State */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Repair Save State
              </CardTitle>
              <CardDescription>
                Scans and auto-fixes common corruption: orphaned player club references,
                null required fields, ladder inconsistencies, and cap spend drift.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {repairResult && (
                <div className={`space-y-1.5 rounded-md border p-3 text-sm ${repairResult.fixed > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border'}`}>
                  <p className={repairResult.fixed > 0 ? 'text-emerald-400 font-medium' : 'text-muted-foreground'}>
                    {repairResult.fixed === 0
                      ? 'No issues found — save state is clean.'
                      : `Repaired ${repairResult.fixed} issue${repairResult.fixed !== 1 ? 's' : ''}.`}
                  </p>
                  {repairResult.details.length > 0 && (
                    <ScrollArea className="h-32">
                      <ul className="space-y-0.5 text-xs text-muted-foreground">
                        {repairResult.details.map((d, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" />
                            {d}
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRepairConfirm(true)}
                className="gap-2"
              >
                <Wrench className="h-4 w-4" />
                Run Repair Scan
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Maintenance confirmation dialogs ── */}

      {/* Retire confirm */}
      {retireConfirm && (
        <Dialog open onOpenChange={(open) => { if (!open) setRetireConfirm(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Force Retire {retireConfirm.firstName} {retireConfirm.lastName}?</DialogTitle>
              <DialogDescription>
                This will immediately remove {retireConfirm.firstName} {retireConfirm.lastName} from{' '}
                {clubs[retireConfirm.clubId]?.name ?? retireConfirm.clubId}'s list. Their salary cap space
                will be freed. This cannot be undone without loading an earlier save.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRetireConfirm(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const result = forceRetirePlayer(retireConfirm.id)
                  setRetireConfirm(null)
                  setRetireSearch('')
                  if (!result.success) alert(result.message)
                }}
              >
                <Skull className="mr-2 h-4 w-4" />
                Confirm Retirement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Fix list violations confirm */}
      <Dialog open={showFixListConfirm} onOpenChange={setShowFixListConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fix List Violations?</DialogTitle>
            <DialogDescription>
              This will delist the worst-rated excess players to free agency until all clubs are within their
              list limits. {listViolations.reduce((n, v) => n + Math.max(0, v.seniorCount - v.seniorLimit) + Math.max(0, v.rookieCount - v.rookieLimit), 0)} players
              will be affected. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFixListConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const result = fixListViolations(listViolationClub === 'all' ? undefined : listViolationClub)
                setListViolationResult(result)
                setShowFixListConfirm(false)
              }}
            >
              <ListX className="mr-2 h-4 w-4" />
              Fix Violations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate fixture confirm */}
      <Dialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Fixture?</DialogTitle>
            <DialogDescription>
              This will generate a completely new fixture schedule using the current clubs and settings.
              The existing fixture will be replaced. Any broadcast assignments will be recalculated.
              Only works before round 1 has been played.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateConfirm(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const result = regenerateFixture()
                setFixtureResult(result)
                setShowRegenerateConfirm(false)
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Undo trade confirm */}
      <Dialog open={showUndoTradeConfirm} onOpenChange={setShowUndoTradeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo Last Trade?</DialogTitle>
            <DialogDescription>
              This will move players back to their original clubs and remove the trade from history.
              Cap spend will be recalculated. If players have been traded again since, the result
              may be unexpected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUndoTradeConfirm(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const result = undoLastTrade()
                setUndoTradeResult(result.message)
                setShowUndoTradeConfirm(false)
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Undo Trade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repair save confirm */}
      <Dialog open={showRepairConfirm} onOpenChange={setShowRepairConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repair Save State?</DialogTitle>
            <DialogDescription>
              This will scan and automatically fix common corruption: invalid club references,
              null player fields, ladder inconsistencies, and cap spend drift.
              The scan is non-destructive except where fixing corrupted data is necessary.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRepairConfirm(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const result = repairSaveState()
                setRepairResult(result)
                setShowRepairConfirm(false)
              }}
            >
              <Wrench className="mr-2 h-4 w-4" />
              Run Repair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Player edit dialog */}
      {editingPlayer && (
        <PlayerEditDialog
          player={editingPlayer}
          clubs={clubs}
          onClose={() => setEditingPlayer(null)}
        />
      )}

      {/* Club edit dialog */}
      {editingClubId && (
        <ClubEditDialog
          clubId={editingClubId}
          onClose={() => setEditingClubId(null)}
        />
      )}
    </div>
  )
}

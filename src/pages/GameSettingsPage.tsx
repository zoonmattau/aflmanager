import { useEffect, useMemo, useState, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { GameSettings, RealismSettings } from '@/types/game'
import type { AflDistributionConfig, DistributionModel } from '@/types/distributions'
import { DEFAULT_DISTRIBUTION_CONFIG, getDistributionPreviewTable } from '@/engine/clubs/distributionEngine'
import type { MatchDay } from '@/types/season'
import type { Club } from '@/types/club'
import type { OriginConfig, OriginCompetitionFormat, OriginScheduleMode, OriginState, SpecialEventId, OriginEligibility } from '@/types/specialEvents'
import { ALL_ORIGIN_STATES } from '@/types/specialEvents'
import { createDefaultSettings, DEFAULT_ORIGIN_CONFIG } from '@/engine/core/defaultSettings'
import { SPECIAL_EVENT_DEFINITIONS } from '@/engine/specialEvents/eventDefinitions'
import { AffiliateManagementEditor } from '@/components/stateLeague/AffiliateManagementEditor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { FinalsFormatEditor } from '@/pages/wizard/FinalsFormatEditor'
import { TeamEditorPanel } from '@/components/teams/TeamEditorPanel'
import type { TeamEditorData } from '@/components/teams/TeamEditorPanel'
import { ChevronDown, ChevronRight } from 'lucide-react'

function clubToEditorData(club: Club): TeamEditorData {
  return {
    id: club.id,
    name: club.name,
    fullName: club.fullName,
    abbreviation: club.abbreviation,
    mascot: club.mascot,
    logoUrl: club.logoUrl ?? '',
    homeGround: club.homeGround,
    secondaryHomeGrounds: club.secondaryHomeGrounds ?? [],
    established: club.established,
    colors: { ...club.colors },
    guernseyStyle: club.guernseyStyle ?? null,
    notes: club.notes ?? '',
    rivalryClubIds: club.rivalryClubIds ?? [],
    tier: club.tier,
    finances: {
      revenue: club.finances.revenue,
      expenses: club.finances.expenses,
      balance: club.finances.balance,
    },
    fanSatisfaction: club.fanSatisfaction ?? 50,
  }
}

function editorDataToClubUpdates(updates: Partial<TeamEditorData>, existing: Club): Partial<Club> {
  const out: Partial<Club> = {}
  if (updates.name !== undefined) out.name = updates.name
  if (updates.fullName !== undefined) out.fullName = updates.fullName
  if (updates.abbreviation !== undefined) out.abbreviation = updates.abbreviation
  if (updates.mascot !== undefined) out.mascot = updates.mascot
  if (updates.logoUrl !== undefined) out.logoUrl = updates.logoUrl
  if (updates.homeGround !== undefined) out.homeGround = updates.homeGround
  if (updates.secondaryHomeGrounds !== undefined) out.secondaryHomeGrounds = updates.secondaryHomeGrounds
  if (updates.established !== undefined) out.established = updates.established
  if (updates.colors !== undefined) out.colors = updates.colors
  if (updates.guernseyStyle !== undefined) out.guernseyStyle = updates.guernseyStyle ?? undefined
  if (updates.notes !== undefined) out.notes = updates.notes
  if (updates.rivalryClubIds !== undefined) out.rivalryClubIds = updates.rivalryClubIds
  if (updates.tier !== undefined) out.tier = updates.tier
  if (updates.fanSatisfaction !== undefined) out.fanSatisfaction = updates.fanSatisfaction
  if (updates.finances !== undefined) {
    out.finances = {
      ...existing.finances,
      revenue: updates.finances.revenue,
      expenses: updates.finances.expenses,
      balance: updates.finances.balance,
    }
  }
  return out
}

const GF_VENUES = ['MCG', 'Marvel Stadium', 'Adelaide Oval', 'Optus Stadium', 'Gabba']
const MATCH_DAY_OPTIONS: MatchDay[] = [
  'Thursday',
  'Friday',
  'Saturday-Early',
  'Saturday-Twilight',
  'Saturday-Night',
  'Sunday-Early',
  'Sunday-Twilight',
  'Monday',
]
const REALISM_LABELS: Record<keyof RealismSettings, string> = {
  playerLoyalty: 'Player Loyalty',
  tradeRequests: 'Trade Requests',
  nominatedTradeDestinations: 'Nominated Destinations',
  reducedNominatedLeverage: 'Reduced Nominated Leverage',
  playersRefuseTrades: 'Players Refuse Trades',
  playerRoleDisputes: 'Player Role Disputes',
  salaryDumpTrades: 'Salary Dump Trades',
  softCapSpending: 'Soft Cap Spending',
  draftVariance: 'Draft Variance',
  ngaAcademy: 'NGA / Academy',
  ngaAcademyZoneMatching: 'NGA Zone Matching',
  fixtureBlockbusterBias: 'Fixture Blockbuster Bias',
  fixtureRivalryScheduling: 'Rivalry Scheduling',
  venueScheduling: 'Venue Scheduling',
  coachingCarousel: 'Coaching Carousel',
  boardPressure: 'Board Pressure',
  boardPolitics: 'Board Politics',
  aflHouseInterference: 'AFL House Interference',
  aflHouseExpansionEvolution: 'AFL House Expansion Evolution',
  aflHouseCompetitionEvolution: 'AFL House Competition Evolution',
  aflHouseFinalsEvolution: 'AFL House Finals Evolution',
  aflHouseListRulesEvolution: 'AFL House List Rules Evolution',
  aflHouseSalaryCapEvolution: 'AFL House Salary Cap Evolution',
  aflHouseFixtureEvolution: 'AFL House Fixture Evolution',
  listSizeEnforcement: 'List Size Enforcement',
  mediaLeaks: 'Media Leaks',
  negotiationDelays: 'Negotiation Delays',
  tacticalInjuryConsequences: 'Tactical Injury Consequences',
  tacticalSuspensionConsequences: 'Tactical Suspension Consequences',
  brownlowNight: 'Brownlow Night',
  specialEventPlayerImpact: 'Special Event Player Impact',
  tribunalEarlyPleaDiscount: 'Tribunal Early Plea Discount',
  tribunalLegalRepresentation: 'Tribunal Legal Representation',
  tribunalPriorRecord: 'Tribunal Prior Record',
  allowLoans: 'Allow Club Loans',
}

function formatMatchDay(day: MatchDay): string {
  return day.replace('-', ' ')
}

function toPositiveInt(value: string, fallback = 0): number {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.max(0, Math.round(next))
}

const ORIGIN_FORMAT_LABELS: Record<OriginCompetitionFormat, string> = {
  'best-of-3': 'Best of 3',
  'round-robin': 'Round Robin',
  'single-annual': 'Single Annual',
}

const ORIGIN_SCHEDULE_LABELS: Record<OriginScheduleMode, string> = {
  'mid-season-block': 'Mid-season block (bye rounds)',
  'weeknight-spread': 'Weeknight spread',
  'pre-finals': 'Pre-finals showcase',
  'post-season': 'Post-season',
}

const ORIGIN_STATE_LABELS: Record<OriginState, string> = {
  VIC: 'Victoria',
  SA: 'South Australia',
  WA: 'Western Australia',
  QLD: 'Queensland',
  NSW: 'New South Wales',
  TAS: 'Tasmania',
  NT: 'Northern Territory',
}

function computeDefaultMatchCount(format: OriginCompetitionFormat, teamCount: number): number {
  switch (format) {
    case 'best-of-3': return 3
    case 'round-robin': return Math.max(1, (teamCount * (teamCount - 1)) / 2)
    case 'single-annual': return 1
  }
}

function getEffectiveTeamCount(config: OriginConfig): number {
  const alliesSet = new Set<string>(config.alliesEnabled ? config.alliesStates : [])
  let count = 0
  for (const s of config.participatingStates) {
    if (!alliesSet.has(s)) count++
  }
  if (config.alliesEnabled && config.alliesStates.length > 0) count++
  return count
}

export function GameSettingsPage() {
  const settings = useGameStore((s) => s.settings)
  const clubs = useGameStore((s) => s.clubs)
  const leagueConfig = useGameStore((s) => s.leagueConfig)
  const stateLeagues = useGameStore((s) => s.stateLeagues)
  const updateGameSettings = useGameStore((s) => s.updateGameSettings)
  const updateClub = useGameStore((s) => s.updateClub)
  const [draft, setDraft] = useState<GameSettings>(settings)
  const [savedTick, setSavedTick] = useState(0)
  const [sectionsOpen, setSectionsOpen] = useState({
    finals: true,
    timeSlots: false,
    blockbusters: false,
    specialEvents: false,
    realism: false,
    distributions: false,
    teams: false,
  })

  useEffect(() => {
    setDraft(settings)
  }, [settings])

  const realismKeys = useMemo(() => Object.keys(draft.realism) as (keyof RealismSettings)[], [draft.realism])

  const clubOptions = useMemo(
    () => Object.values(clubs).sort((a, b) => a.name.localeCompare(b.name)),
    [clubs],
  )

  const venueOptions = useMemo(() => {
    const set = new Set<string>(GF_VENUES)
    for (const club of Object.values(clubs)) {
      if (club.homeGround) set.add(club.homeGround)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [clubs])

  const allTeamsForEditor = useMemo(
    () => clubOptions.map((c) => ({ id: c.id, name: c.name })),
    [clubOptions],
  )
  const handleTeamChange = useCallback(
    (clubId: string, updates: Partial<TeamEditorData>) => {
      const existing = clubs[clubId]
      if (!existing) return
      const clubUpdates = editorDataToClubUpdates(updates, existing)
      updateClub(clubId, clubUpdates)

      // Bidirectional rivalry sync
      if (updates.rivalryClubIds) {
        const oldRivals = existing.rivalryClubIds ?? []
        const newRivals = updates.rivalryClubIds
        // Added rivals
        for (const rid of newRivals) {
          if (!oldRivals.includes(rid)) {
            const rival = clubs[rid]
            if (rival) {
              const rivalIds = rival.rivalryClubIds ?? []
              if (!rivalIds.includes(clubId)) {
                updateClub(rid, { rivalryClubIds: [...rivalIds, clubId] })
              }
            }
          }
        }
        // Removed rivals
        for (const rid of oldRivals) {
          if (!newRivals.includes(rid)) {
            const rival = clubs[rid]
            if (rival) {
              const rivalIds = rival.rivalryClubIds ?? []
              updateClub(rid, { rivalryClubIds: rivalIds.filter((id) => id !== clubId) })
            }
          }
        }
      }
    },
    [clubs, updateClub],
  )

  const saveDraft = () => {
    updateGameSettings(draft)
    setSavedTick((t) => t + 1)
  }

  const addMatchSlot = () => {
    setDraft((prev) => ({
      ...prev,
      fixtureSchedule: {
        ...prev.fixtureSchedule,
        matchSlots: [
          ...prev.fixtureSchedule.matchSlots,
          {
            id: `slot-${Date.now()}`,
            day: 'Saturday-Twilight',
            time: '3:20pm',
            enabled: true,
          },
        ],
      },
    }))
  }

  const updateMatchSlot = (slotId: string, updates: Partial<GameSettings['fixtureSchedule']['matchSlots'][number]>) => {
    setDraft((prev) => ({
      ...prev,
      fixtureSchedule: {
        ...prev.fixtureSchedule,
        matchSlots: prev.fixtureSchedule.matchSlots.map((slot) =>
          slot.id === slotId ? { ...slot, ...updates } : slot,
        ),
      },
    }))
  }

  const removeMatchSlot = (slotId: string) => {
    setDraft((prev) => {
      if (prev.fixtureSchedule.matchSlots.length <= 1) return prev
      return {
        ...prev,
        fixtureSchedule: {
          ...prev.fixtureSchedule,
          matchSlots: prev.fixtureSchedule.matchSlots.filter((slot) => slot.id !== slotId),
        },
      }
    })
  }

  const toggleSlotEnabled = (slotId: string, enabled: boolean) => {
    setDraft((prev) => {
      const enabledCount = prev.fixtureSchedule.matchSlots.filter((slot) => slot.enabled).length
      const target = prev.fixtureSchedule.matchSlots.find((slot) => slot.id === slotId)
      if (target?.enabled && !enabled && enabledCount <= 1) return prev
      return {
        ...prev,
        fixtureSchedule: {
          ...prev.fixtureSchedule,
          matchSlots: prev.fixtureSchedule.matchSlots.map((slot) =>
            slot.id === slotId ? { ...slot, enabled } : slot,
          ),
        },
      }
    })
  }

  const addBlockbuster = () => {
    const home = clubOptions[0]?.id
    const away = clubOptions[1]?.id ?? clubOptions[0]?.id
    if (!home || !away) return
    setDraft((prev) => ({
      ...prev,
      blockbusters: [
        ...prev.blockbusters,
        {
          id: `custom-${Date.now()}`,
          name: 'Custom Feature Match',
          homeClubId: home,
          awayClubId: away,
          venue: clubs[home]?.homeGround ?? 'MCG',
          scheduledDay: 'Saturday-Night',
          scheduledTime: '7:25pm',
          targetRound: 'auto',
          enabled: true,
          type: 'event',
        },
      ],
    }))
  }

  const updateBlockbuster = (id: string, updates: Partial<GameSettings['blockbusters'][number]>) => {
    setDraft((prev) => ({
      ...prev,
      blockbusters: prev.blockbusters.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }))
  }

  const removeBlockbuster = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      blockbusters: prev.blockbusters.filter((item) => item.id !== id),
    }))
  }

  const toggleSection = (key: keyof typeof sectionsOpen) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const distConfig: AflDistributionConfig = draft.aflDistributions ?? DEFAULT_DISTRIBUTION_CONFIG
  const setDist = (patch: Partial<AflDistributionConfig>) =>
    setDraft((p) => ({ ...p, aflDistributions: { ...(p.aflDistributions ?? DEFAULT_DISTRIBUTION_CONFIG), ...patch } }))
  const distPreview = useMemo(
    () => getDistributionPreviewTable(distConfig, draft.teamCount ?? 18),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(distConfig), draft.teamCount],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Game Settings</h1>
          <p className="text-sm text-muted-foreground">
            Edit rules and simulation behavior for this save. Fixture and structure changes are applied on next season generation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDraft(createDefaultSettings())}>Reset To Defaults</Button>
          <Button onClick={saveDraft}>Save Changes</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="xl:col-span-2 border-amber-500/40 bg-amber-500/10">
          <CardContent className="py-3 text-sm text-amber-900 dark:text-amber-200">
            Fixture, season structure, finals format, league mode, and team count changes are queued for upcoming season generation and will not rewrite the current fixture mid-season.
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Core Rules</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Difficulty</Label>
                <Select value={draft.difficulty} onValueChange={(v) => setDraft((p) => ({ ...p, difficulty: v as GameSettings['difficulty'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sim Speed</Label>
                <Select value={draft.simSpeed} onValueChange={(v) => setDraft((p) => ({ ...p, simSpeed: v as GameSettings['simSpeed'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">Instant</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>League Mode</Label>
                <Select value={draft.leagueMode} onValueChange={(v) => setDraft((p) => ({ ...p, leagueMode: v as GameSettings['leagueMode'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="real">Real</SelectItem>
                    <SelectItem value="fictional">Fictional</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Applies on future league generation</p>
              </div>
              <div className="space-y-1.5">
                <Label>Team Count</Label>
                <Input
                  type="number"
                  value={draft.teamCount}
                  onChange={(e) => setDraft((p) => ({ ...p, teamCount: Math.max(2, toPositiveInt(e.target.value, 18)) }))}
                />
                <p className="text-[11px] text-muted-foreground">Applies on future league generation</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Season Start Date</Label>
                <Input
                  type="date"
                  value={draft.seasonStartDate}
                  onChange={(e) => setDraft((p) => ({ ...p, seasonStartDate: e.target.value || p.seasonStartDate }))}
                />
                <p className="text-[11px] text-muted-foreground">Used for next season generation</p>
              </div>
              <div className="space-y-1.5">
                <Label>Game Start Date</Label>
                <Input
                  type="date"
                  value={draft.gameStartDate}
                  onChange={(e) => setDraft((p) => ({ ...p, gameStartDate: e.target.value || p.gameStartDate }))}
                />
                <p className="text-[11px] text-muted-foreground">Start point for offseason timeline</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Season Structure</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Season Rounds</Label>
                <Input
                  type="number"
                  value={draft.seasonStructure.regularSeasonRounds}
                  onChange={(e) => setDraft((p) => ({
                    ...p,
                    seasonStructure: {
                      ...p.seasonStructure,
                      regularSeasonRounds: toPositiveInt(e.target.value),
                    },
                  }))}
                />
                <p className="text-[11px] text-muted-foreground">Applies next season</p>
              </div>
              <div className="space-y-1.5">
                <Label>Bye Round Count</Label>
                <Input
                  type="number"
                  value={draft.seasonStructure.byeRoundCount}
                  onChange={(e) => setDraft((p) => ({
                    ...p,
                    seasonStructure: {
                      ...p.seasonStructure,
                      byeRoundCount: toPositiveInt(e.target.value),
                    },
                  }))}
                />
                <p className="text-[11px] text-muted-foreground">Applies next season</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Bye Rounds</Label>
              <Switch
                checked={draft.seasonStructure.byeRounds}
                onCheckedChange={(v) => setDraft((p) => ({ ...p, seasonStructure: { ...p.seasonStructure, byeRounds: v } }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Match + Ladder</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Points Per Goal</Label>
                <Input type="number" value={draft.matchRules.pointsPerGoal} onChange={(e) => setDraft((p) => ({ ...p, matchRules: { ...p.matchRules, pointsPerGoal: toPositiveInt(e.target.value, 6) } }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Points Per Behind</Label>
                <Input type="number" value={draft.matchRules.pointsPerBehind} onChange={(e) => setDraft((p) => ({ ...p, matchRules: { ...p.matchRules, pointsPerBehind: toPositiveInt(e.target.value, 1) } }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Quarters Per Match</Label>
              <Select value={String(draft.matchRules.quartersPerMatch)} onValueChange={(v) => setDraft((p) => ({ ...p, matchRules: { ...p.matchRules, quartersPerMatch: Number(v) } }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 Halves</SelectItem>
                  <SelectItem value="3">3 Thirds</SelectItem>
                  <SelectItem value="4">4 Quarters</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Interchange Players</Label>
                <span className="text-xs text-muted-foreground">{draft.matchRules.interchangePlayers}</span>
              </div>
              <Slider value={[draft.matchRules.interchangePlayers]} min={0} max={8} step={1} onValueChange={([v]) => setDraft((p) => ({ ...p, matchRules: { ...p.matchRules, interchangePlayers: v } }))} />
            </div>
            <div className="flex items-center justify-between rounded border px-3 py-2">
              <div>
                <Label>Enable Match-Day Substitute</Label>
                <p className="text-[11px] text-muted-foreground">Adds one tactical substitute selection per club</p>
              </div>
              <Switch
                checked={draft.matchRules.enableSubstitutes}
                onCheckedChange={(v) => setDraft((p) => ({ ...p, matchRules: { ...p.matchRules, enableSubstitutes: v } }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Possessions Multiplier</Label>
                <span className="text-xs text-muted-foreground">{draft.matchRules.possessionsMultiplier.toFixed(1)}x</span>
              </div>
              <Slider value={[draft.matchRules.possessionsMultiplier * 10]} min={5} max={20} step={1} onValueChange={([v]) => setDraft((p) => ({ ...p, matchRules: { ...p.matchRules, possessionsMultiplier: v / 10 } }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Win Pts</Label>
                <Input type="number" value={draft.ladderPoints.pointsForWin} onChange={(e) => setDraft((p) => ({ ...p, ladderPoints: { ...p.ladderPoints, pointsForWin: toPositiveInt(e.target.value, 4) } }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Draw Pts</Label>
                <Input type="number" value={draft.ladderPoints.pointsForDraw} onChange={(e) => setDraft((p) => ({ ...p, ladderPoints: { ...p.ladderPoints, pointsForDraw: toPositiveInt(e.target.value, 2) } }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Loss Pts</Label>
                <Input type="number" value={draft.ladderPoints.pointsForLoss} onChange={(e) => setDraft((p) => ({ ...p, ladderPoints: { ...p.ladderPoints, pointsForLoss: toPositiveInt(e.target.value, 0) } }))} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">List + Cap</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Senior List Size</Label>
                <Input type="number" value={draft.listRules.seniorListSize} onChange={(e) => setDraft((p) => ({ ...p, listRules: { ...p.listRules, seniorListSize: toPositiveInt(e.target.value, 38) } }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Rookie List Size</Label>
                <Input type="number" value={draft.listRules.rookieListSize} onChange={(e) => setDraft((p) => ({ ...p, listRules: { ...p.listRules, rookieListSize: toPositiveInt(e.target.value, 6) } }))} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Salary Cap</Label>
              <Switch checked={draft.salaryCap} onCheckedChange={(v) => setDraft((p) => ({ ...p, salaryCap: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Salary Cap Amount</Label>
              <Input type="number" value={draft.salaryCapAmount} onChange={(e) => setDraft((p) => ({ ...p, salaryCapAmount: toPositiveInt(e.target.value, 0) }))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Signing Notifications</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Marquee Star Threshold</Label>
                <span className="text-xs text-muted-foreground">{draft.notifications.signings.starThreshold.toFixed(1)}★</span>
              </div>
              <Slider
                value={[draft.notifications.signings.starThreshold * 10]}
                min={5}
                max={50}
                step={5}
                onValueChange={([v]) =>
                  setDraft((p) => ({
                    ...p,
                    notifications: {
                      ...p.notifications,
                      signings: {
                        ...p.notifications.signings,
                        starThreshold: v / 10,
                      },
                    },
                  }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Non-interacted signings below this star rating are suppressed.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label>In-App Alerts</Label>
              <Switch
                checked={draft.notifications.signings.inApp}
                onCheckedChange={(v) =>
                  setDraft((p) => ({
                    ...p,
                    notifications: {
                      ...p.notifications,
                      signings: { ...p.notifications.signings, inApp: v },
                    },
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Email Alerts</Label>
              <Switch
                checked={draft.notifications.signings.email}
                onCheckedChange={(v) =>
                  setDraft((p) => ({
                    ...p,
                    notifications: {
                      ...p.notifications,
                      signings: { ...p.notifications.signings, email: v },
                    },
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Daily Digest (vs real-time)</Label>
              <Switch
                checked={draft.notifications.signings.dailyDigest}
                onCheckedChange={(v) =>
                  setDraft((p) => ({
                    ...p,
                    notifications: {
                      ...p.notifications,
                      signings: { ...p.notifications.signings, dailyDigest: v },
                    },
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <div className="xl:col-span-2">
          <AffiliateManagementEditor
            clubs={clubOptions.map((club) => ({
              id: club.id,
              name: club.name,
              abbreviation: club.abbreviation,
            }))}
            stateLeagues={stateLeagues}
            value={draft.stateLeagueAffiliations}
            onChange={(next) => setDraft((prev) => ({ ...prev, stateLeagueAffiliations: next }))}
            title="State League Affiliations"
            description="Edit or swap AFL club affiliate leagues. Saving applies changes to league club placement, fixtures, and ladders."
          />
        </div>

        <Card className="xl:col-span-2">
          <CardHeader>
            <button type="button" className="flex w-full items-center justify-between" onClick={() => toggleSection('finals')}>
              <CardTitle className="text-base">Finals + Progression</CardTitle>
              {sectionsOpen.finals ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {sectionsOpen.finals && (
          <CardContent className="space-y-4">
            <FinalsFormatEditor
              finals={draft.finals}
              onChange={(nextFinals) => setDraft((p) => ({ ...p, finals: nextFinals }))}
              leagueConfig={leagueConfig}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Grand Final Venue Mode</Label>
                <Select value={draft.finals.grandFinalVenueMode} onValueChange={(v) => setDraft((p) => ({ ...p, finals: { ...p.finals, grandFinalVenueMode: v as GameSettings['finals']['grandFinalVenueMode'] } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                    <SelectItem value="top-club">Top Club Home</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Grand Final Venue</Label>
                <Select value={draft.finals.grandFinalVenue} onValueChange={(v) => setDraft((p) => ({ ...p, finals: { ...p.finals, grandFinalVenue: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {venueOptions.map((venue) => <SelectItem key={venue} value={venue}>{venue}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Injury Frequency</Label>
                <Select value={draft.injuryFrequency} onValueChange={(v) => setDraft((p) => ({ ...p, injuryFrequency: v as GameSettings['injuryFrequency'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Development Speed</Label>
                <Select value={draft.developmentSpeed} onValueChange={(v) => setDraft((p) => ({ ...p, developmentSpeed: v as GameSettings['developmentSpeed'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slow">Slow</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <button type="button" className="flex items-center gap-2" onClick={() => toggleSection('timeSlots')}>
                {sectionsOpen.timeSlots ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <CardTitle className="text-base">Fixture Time Slots</CardTitle>
              </button>
              {sectionsOpen.timeSlots && <Button variant="outline" size="sm" onClick={addMatchSlot}>Add Slot</Button>}
            </div>
          </CardHeader>
          {sectionsOpen.timeSlots && (
          <CardContent className="space-y-2">
            {draft.fixtureSchedule.matchSlots.map((slot) => (
              <div key={slot.id} className="grid grid-cols-1 gap-2 rounded border p-2 md:grid-cols-[1fr_1fr_auto_auto] md:items-center">
                <Select value={slot.day} onValueChange={(value) => updateMatchSlot(slot.id, { day: value as MatchDay })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATCH_DAY_OPTIONS.map((day) => <SelectItem key={day} value={day}>{formatMatchDay(day)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={slot.time} onChange={(e) => updateMatchSlot(slot.id, { time: e.target.value })} placeholder="7:25pm" />
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Enabled</Label>
                  <Switch checked={slot.enabled} onCheckedChange={(v) => toggleSlotEnabled(slot.id, v)} />
                </div>
                <Button variant="outline" size="sm" onClick={() => removeMatchSlot(slot.id)} disabled={draft.fixtureSchedule.matchSlots.length <= 1}>Remove</Button>
              </div>
            ))}
          </CardContent>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <button type="button" className="flex items-center gap-2" onClick={() => toggleSection('blockbusters')}>
                {sectionsOpen.blockbusters ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <CardTitle className="text-base">Blockbusters + Derbies</CardTitle>
              </button>
              {sectionsOpen.blockbusters && <Button variant="outline" size="sm" onClick={addBlockbuster}>Add Matchup</Button>}
            </div>
          </CardHeader>
          {sectionsOpen.blockbusters && (
          <CardContent className="space-y-3">
            {draft.blockbusters.map((item) => {
              const roundMode = item.targetRound === 'auto' ? 'auto' : 'manual'
              return (
                <div key={item.id} className="space-y-2 rounded border p-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.5fr_130px_auto_auto] md:items-center">
                    <Input value={item.name} onChange={(e) => updateBlockbuster(item.id, { name: e.target.value })} placeholder="Feature match name" />
                    <Select value={item.type} onValueChange={(v) => updateBlockbuster(item.id, { type: v as 'event' | 'derby' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="derby">Derby</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Enabled</Label>
                      <Switch checked={item.enabled} onCheckedChange={(v) => updateBlockbuster(item.id, { enabled: v })} />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => removeBlockbuster(item.id)}>Remove</Button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Home Club</Label>
                      <Select value={item.homeClubId} onValueChange={(v) => updateBlockbuster(item.id, { homeClubId: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {clubOptions.map((club) => <SelectItem key={club.id} value={club.id}>{club.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Away Club</Label>
                      <Select value={item.awayClubId} onValueChange={(v) => updateBlockbuster(item.id, { awayClubId: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {clubOptions.map((club) => <SelectItem key={club.id} value={club.id}>{club.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <Input value={item.venue} onChange={(e) => updateBlockbuster(item.id, { venue: e.target.value })} placeholder="Venue" />
                    <Select value={item.scheduledDay} onValueChange={(v) => updateBlockbuster(item.id, { scheduledDay: v as MatchDay })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MATCH_DAY_OPTIONS.map((day) => <SelectItem key={day} value={day}>{formatMatchDay(day)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={item.scheduledTime} onChange={(e) => updateBlockbuster(item.id, { scheduledTime: e.target.value })} placeholder="Time" />
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <Select
                        value={roundMode}
                        onValueChange={(v) => updateBlockbuster(item.id, { targetRound: v === 'auto' ? 'auto' : 1 })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        disabled={item.targetRound === 'auto'}
                        value={item.targetRound === 'auto' ? '' : item.targetRound}
                        onChange={(e) => updateBlockbuster(item.id, { targetRound: toPositiveInt(e.target.value, 1) || 1 })}
                        placeholder="Round"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <button type="button" className="flex w-full items-center justify-between" onClick={() => toggleSection('specialEvents')}>
              <CardTitle className="text-base">Special Events & State of Origin</CardTitle>
              {sectionsOpen.specialEvents ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {sectionsOpen.specialEvents && (
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Special Events</Label>
                <p className="text-xs text-muted-foreground">Exhibition matches throughout the season</p>
              </div>
              <Switch
                checked={draft.specialEvents.enabled}
                onCheckedChange={(v) => setDraft((p) => ({ ...p, specialEvents: { ...p.specialEvents, enabled: v } }))}
              />
            </div>

            {draft.specialEvents.enabled && (
              <div className="space-y-3 border-t pt-3">
                {SPECIAL_EVENT_DEFINITIONS.map((def) => (
                  <div key={def.id} className="flex items-center justify-between">
                    <div>
                      <Label>{def.name}</Label>
                      <p className="text-xs text-muted-foreground">{def.description}</p>
                    </div>
                    <Switch
                      checked={draft.specialEvents.events[def.id as SpecialEventId]}
                      onCheckedChange={(v) =>
                        setDraft((p) => ({
                          ...p,
                          specialEvents: {
                            ...p.specialEvents,
                            events: { ...p.specialEvents.events, [def.id]: v },
                          },
                        }))
                      }
                    />
                  </div>
                ))}

                <div className="flex items-center justify-between border-t pt-3">
                  <div>
                    <Label>Auto-Schedule</Label>
                    <p className="text-xs text-muted-foreground">Automatically place events at realistic dates</p>
                  </div>
                  <Switch
                    checked={draft.specialEvents.autoSchedule}
                    onCheckedChange={(v) => setDraft((p) => ({ ...p, specialEvents: { ...p.specialEvents, autoSchedule: v } }))}
                  />
                </div>

                <div className="space-y-1.5 border-t pt-3">
                  <Label>Origin Eligibility</Label>
                  <p className="text-xs text-muted-foreground">How players qualify for state-based representative teams</p>
                  <Select
                    value={draft.specialEvents.originEligibility}
                    onValueChange={(v) => setDraft((p) => ({ ...p, specialEvents: { ...p.specialEvents, originEligibility: v as OriginEligibility } }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="birthplace">Birthplace / Pathway</SelectItem>
                      <SelectItem value="current-club">Current Club State</SelectItem>
                      <SelectItem value="state-league">State League Affiliation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* State of Origin Configuration */}
                {draft.specialEvents.events['state-of-origin'] && (() => {
                  const oc = draft.specialEvents.originConfig ?? DEFAULT_ORIGIN_CONFIG
                  const updateOC = (patch: Partial<OriginConfig>) =>
                    setDraft((p) => ({
                      ...p,
                      specialEvents: {
                        ...p.specialEvents,
                        originConfig: { ...(p.specialEvents.originConfig ?? DEFAULT_ORIGIN_CONFIG), ...patch },
                      },
                    }))
                  const teamCount = getEffectiveTeamCount(oc)
                  const defaultMatchCount = computeDefaultMatchCount(oc.format, teamCount)

                  return (
                    <div className="space-y-4 border-t pt-3">
                      <Label className="text-sm font-medium text-amber-500">State of Origin Configuration</Label>

                      {/* Format */}
                      <div className="space-y-1.5">
                        <Label>Competition Format</Label>
                        <Select
                          value={oc.format}
                          onValueChange={(v) => {
                            const fmt = v as OriginCompetitionFormat
                            const mc = computeDefaultMatchCount(fmt, teamCount)
                            updateOC({ format: fmt, matchCount: mc })
                          }}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(ORIGIN_FORMAT_LABELS) as OriginCompetitionFormat[]).map((f) => (
                              <SelectItem key={f} value={f}>{ORIGIN_FORMAT_LABELS[f]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Match Count */}
                      <div className="space-y-1.5">
                        <Label>Number of Matches</Label>
                        <p className="text-[11px] text-muted-foreground">Default: {defaultMatchCount} for {ORIGIN_FORMAT_LABELS[oc.format].toLowerCase()} with {teamCount} teams</p>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={oc.matchCount}
                          onChange={(e) => updateOC({ matchCount: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)) })}
                          className="w-24"
                        />
                      </div>

                      {/* Participating States */}
                      <div className="space-y-1.5">
                        <Label>Participating States</Label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {ALL_ORIGIN_STATES.map((state) => {
                            const checked = oc.participatingStates.includes(state)
                            return (
                              <label key={state} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const next = checked
                                      ? oc.participatingStates.filter((s) => s !== state)
                                      : [...oc.participatingStates, state]
                                    const ntc = getEffectiveTeamCount({ ...oc, participatingStates: next })
                                    updateOC({ participatingStates: next, matchCount: computeDefaultMatchCount(oc.format, ntc) })
                                  }}
                                  className="accent-amber-500"
                                />
                                {ORIGIN_STATE_LABELS[state]}
                              </label>
                            )
                          })}
                        </div>
                      </div>

                      {/* Allies */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Allies Team</Label>
                            <p className="text-xs text-muted-foreground">Merge smaller states into a combined team</p>
                          </div>
                          <Switch
                            checked={oc.alliesEnabled}
                            onCheckedChange={(v) => {
                              const nc = { ...oc, alliesEnabled: v }
                              const ntc = getEffectiveTeamCount(nc)
                              updateOC({ alliesEnabled: v, matchCount: computeDefaultMatchCount(oc.format, ntc) })
                            }}
                          />
                        </div>
                        {oc.alliesEnabled && (
                          <div className="space-y-2 pl-4 border-l-2 border-border">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Team Name</Label>
                              <Input
                                value={oc.alliesName}
                                onChange={(e) => updateOC({ alliesName: e.target.value || 'Allies' })}
                                className="w-48"
                                placeholder="Allies"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">States in Allies</Label>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {ALL_ORIGIN_STATES.map((state) => {
                                  const checked = oc.alliesStates.includes(state)
                                  return (
                                    <label key={state} className="flex items-center gap-2 text-sm cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const next = checked
                                            ? oc.alliesStates.filter((s) => s !== state)
                                            : [...oc.alliesStates, state]
                                          const nc = { ...oc, alliesStates: next }
                                          const ntc = getEffectiveTeamCount(nc)
                                          updateOC({ alliesStates: next, matchCount: computeDefaultMatchCount(oc.format, ntc) })
                                        }}
                                        className="accent-amber-500"
                                      />
                                      {state}
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Schedule Mode */}
                      <div className="space-y-1.5">
                        <Label>Scheduling</Label>
                        <Select value={oc.scheduleMode} onValueChange={(v) => updateOC({ scheduleMode: v as OriginScheduleMode })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(ORIGIN_SCHEDULE_LABELS) as OriginScheduleMode[]).map((m) => (
                              <SelectItem key={m} value={m}>{ORIGIN_SCHEDULE_LABELS[m]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Match Day */}
                      <div className="space-y-1.5">
                        <Label>Match Day</Label>
                        <Select value={oc.matchDay} onValueChange={(v) => updateOC({ matchDay: v as 'tuesday' | 'wednesday' | 'thursday' })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tuesday">Tuesday</SelectItem>
                            <SelectItem value="wednesday">Wednesday</SelectItem>
                            <SelectItem value="thursday">Thursday</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Showdown Final */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Showdown Final</Label>
                            <p className="text-xs text-muted-foreground">Grand-final-adjacent showcase match</p>
                          </div>
                          <Switch
                            checked={oc.includeShowdownFinal}
                            onCheckedChange={(v) => updateOC({ includeShowdownFinal: v })}
                          />
                        </div>
                        {oc.includeShowdownFinal && (
                          <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-border">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Timing</Label>
                              <Select value={oc.showdownFinalTiming} onValueChange={(v) => updateOC({ showdownFinalTiming: v as 'before-gf' | 'after-gf' })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="before-gf">Before Grand Final</SelectItem>
                                  <SelectItem value="after-gf">After Grand Final</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Venue</Label>
                              <Select value={oc.showdownFinalVenue} onValueChange={(v) => updateOC({ showdownFinalVenue: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {venueOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>

                      <p className="text-[11px] text-muted-foreground">Changes to Origin configuration apply on the next season.</p>
                    </div>
                  )
                })()}
              </div>
            )}
          </CardContent>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <button type="button" className="flex w-full items-center justify-between" onClick={() => toggleSection('realism')}>
              <CardTitle className="text-base">Realism Toggles</CardTitle>
              {sectionsOpen.realism ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {sectionsOpen.realism && (
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {realismKeys.map((key) => (
              <div key={key} className="flex items-center justify-between rounded border px-3 py-2">
                <Label className="text-sm">{REALISM_LABELS[key] ?? key}</Label>
                <Switch checked={draft.realism[key]} onCheckedChange={(v) => setDraft((p) => ({ ...p, realism: { ...p.realism, [key]: v } }))} />
              </div>
            ))}
          </CardContent>
          )}
        </Card>

        {/* AFL Distributions */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <button type="button" className="flex w-full items-center justify-between" onClick={() => toggleSection('distributions')}>
              <CardTitle className="text-base">AFL Distributions &amp; Prize Money</CardTitle>
              {sectionsOpen.distributions ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {sectionsOpen.distributions && (
          <CardContent className="space-y-6">
            {/* Distribution model */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Distribution Model</Label>
                <Select value={distConfig.distributionModel} onValueChange={(v) => setDist({ distributionModel: v as DistributionModel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear (smooth gradient)</SelectItem>
                    <SelectItem value="tiered">Tiered (position bands)</SelectItem>
                    <SelectItem value="flat">Flat (equal share)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>1st Place Prize: <span className="font-mono text-primary">${(distConfig.ladderFirst / 1_000_000).toFixed(2)}M</span></Label>
                <Slider min={500_000} max={5_000_000} step={100_000} value={[distConfig.ladderFirst]}
                  onValueChange={([v]) => setDist({ ladderFirst: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Last Place Prize: <span className="font-mono text-primary">${(distConfig.ladderLast / 1_000_000).toFixed(2)}M</span></Label>
                <Slider min={100_000} max={2_000_000} step={50_000} value={[distConfig.ladderLast]}
                  onValueChange={([v]) => setDist({ ladderLast: v })} />
              </div>
            </div>

            {/* Finals bonuses */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={distConfig.finalsEnabled} onCheckedChange={(v) => setDist({ finalsEnabled: v })} />
                <Label className="font-medium">Finals Performance Bonuses</Label>
              </div>
              {distConfig.finalsEnabled && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 pl-6">
                <div className="space-y-1.5">
                  <Label>Per Finals Win: <span className="font-mono text-primary">${(distConfig.finalsWinBonus / 1_000).toFixed(0)}k</span></Label>
                  <Slider min={0} max={500_000} step={25_000} value={[distConfig.finalsWinBonus]}
                    onValueChange={([v]) => setDist({ finalsWinBonus: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Premiership Bonus: <span className="font-mono text-primary">${(distConfig.premiershipBonus / 1_000).toFixed(0)}k</span></Label>
                  <Slider min={0} max={2_000_000} step={50_000} value={[distConfig.premiershipBonus]}
                    onValueChange={([v]) => setDist({ premiershipBonus: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Runner-Up Bonus: <span className="font-mono text-primary">${(distConfig.runnerUpBonus / 1_000).toFixed(0)}k</span></Label>
                  <Slider min={0} max={1_000_000} step={50_000} value={[distConfig.runnerUpBonus]}
                    onValueChange={([v]) => setDist({ runnerUpBonus: v })} />
                </div>
              </div>
              )}
            </div>

            {/* Equalisation */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={distConfig.equalisationEnabled} onCheckedChange={(v) => setDist({ equalisationEnabled: v })} />
                <Label className="font-medium">Equalisation Payments (bottom clubs)</Label>
              </div>
              {distConfig.equalisationEnabled && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pl-6">
                <div className="space-y-1.5">
                  <Label>Bottom <span className="font-mono text-primary">{distConfig.equalisationThreshold}</span> clubs qualify</Label>
                  <Slider min={1} max={8} step={1} value={[distConfig.equalisationThreshold]}
                    onValueChange={([v]) => setDist({ equalisationThreshold: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment per club: <span className="font-mono text-primary">${(distConfig.equalisationPayment / 1_000).toFixed(0)}k</span></Label>
                  <Slider min={0} max={1_000_000} step={50_000} value={[distConfig.equalisationPayment]}
                    onValueChange={([v]) => setDist({ equalisationPayment: v })} />
                </div>
              </div>
              )}
            </div>

            {/* Travel comp */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={distConfig.travelCompEnabled} onCheckedChange={(v) => setDist({ travelCompEnabled: v })} />
                <Label className="font-medium">Travel Compensation</Label>
              </div>
              {distConfig.travelCompEnabled && (
              <div className="pl-6 max-w-xs space-y-1.5">
                <Label>Per away game: <span className="font-mono text-primary">${(distConfig.travelPerAwayGame / 1_000).toFixed(0)}k</span></Label>
                <Slider min={5_000} max={100_000} step={5_000} value={[distConfig.travelPerAwayGame]}
                  onValueChange={([v]) => setDist({ travelPerAwayGame: v })} />
              </div>
              )}
            </div>

            {/* Performance grants */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={distConfig.performanceGrantEnabled} onCheckedChange={(v) => setDist({ performanceGrantEnabled: v })} />
                <Label className="font-medium">Most-Improved Performance Grants</Label>
              </div>
              {distConfig.performanceGrantEnabled && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pl-6">
                <div className="space-y-1.5">
                  <Label>Number of recipients: <span className="font-mono text-primary">{distConfig.performanceGrantPositions}</span></Label>
                  <Slider min={1} max={6} step={1} value={[distConfig.performanceGrantPositions]}
                    onValueChange={([v]) => setDist({ performanceGrantPositions: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Grant amount: <span className="font-mono text-primary">${(distConfig.performanceGrantAmount / 1_000).toFixed(0)}k</span></Label>
                  <Slider min={50_000} max={500_000} step={25_000} value={[distConfig.performanceGrantAmount]}
                    onValueChange={([v]) => setDist({ performanceGrantAmount: v })} />
                </div>
              </div>
              )}
            </div>

            {/* Preview table */}
            <div className="space-y-2">
              <Label className="font-medium text-sm">Distribution Preview (base ladder prize per position)</Label>
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Pos</th>
                      <th className="px-3 py-2 text-right font-medium">Ladder Prize</th>
                      <th className="px-3 py-2 text-right font-medium">+1 Finals Win</th>
                      {distConfig.equalisationEnabled && <th className="px-3 py-2 text-right font-medium">w/ Equalisation</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {distPreview.map((row) => (
                      <tr key={row.position} className={row.isEqualisation ? 'bg-blue-500/10' : ''}>
                        <td className="px-3 py-1.5 font-mono font-semibold">{row.position}</td>
                        <td className="px-3 py-1.5 text-right font-mono">${(row.ladderPrize / 1_000).toFixed(0)}k</td>
                        <td className="px-3 py-1.5 text-right font-mono text-green-600">${(row.withOneFinalWin / 1_000).toFixed(0)}k</td>
                        {distConfig.equalisationEnabled && (
                          <td className="px-3 py-1.5 text-right font-mono text-blue-600">${(row.withEqualisation / 1_000).toFixed(0)}k</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <button type="button" className="flex w-full items-center justify-between" onClick={() => toggleSection('teams')}>
              <CardTitle className="text-base">Team Editor</CardTitle>
              {sectionsOpen.teams ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {sectionsOpen.teams && (
          <CardContent className="space-y-2">
            {clubOptions.map((club) => (
              <TeamEditorPanel
                key={club.id}
                team={clubToEditorData(club)}
                allTeams={allTeamsForEditor}
                onChange={(updates) => handleTeamChange(club.id, updates)}
              />
            ))}
          </CardContent>
          )}
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">Settings saved: {savedTick}</p>
    </div>
  )
}

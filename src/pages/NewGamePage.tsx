import { useState, useMemo } from 'react'
import type { GameSettings, RealismSettings } from '@/types/game'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { useGameStore } from '@/stores/gameStore'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  Shield,
  CheckCircle2,
  Search,
  RotateCcw,
  Play,
  Trophy,
} from 'lucide-react'
import clubsData from '@/data/clubs.json'
import { FINALS_FORMATS } from '@/engine/season/finalsFormats'
import { DIFFICULTY_PRESETS } from '@/engine/core/difficultyPresets'
import { createDefaultSettings, GF_VENUES, DEFAULT_ORIGIN_CONFIG } from '@/engine/core/defaultSettings'
import { addDays, computeDefaultGameStartDate, diffDays, formatDate } from '@/engine/calendar/calendarEngine'
import { generateFictionalLeague } from '@/engine/league/leagueGenerator'
import { buildClubsFromTemplate, buildLeagueConfigFromTemplate, buildSettingsFromTemplate } from '@/engine/league/customLeagueBuilder'
import type { Club } from '@/types/club'
import type { CustomLeagueTemplate } from '@/types/customLeague'
import type { LeagueConfig } from '@/types/expansion'
import type { OffseasonPhase } from '@/engine/season/offseasonFlow'
import type { StateLeague, StateLeagueId } from '@/types/stateLeague'
import { AdvancedSection } from '@/pages/wizard/AdvancedSection'
import { MatchSlotGrid } from '@/pages/wizard/MatchSlotGrid'
import { BlockbusterEditor } from '@/pages/wizard/BlockbusterEditor'
import { FinalsFormatEditor } from '@/pages/wizard/FinalsFormatEditor'
import { AffiliateManagementEditor } from '@/components/stateLeague/AffiliateManagementEditor'
import { applyStateLeagueAffiliationSettings, initializeStateLeagues } from '@/engine/stateLeague/stateLeagueEngine'
import { SPECIAL_EVENT_DEFINITIONS } from '@/engine/specialEvents/eventDefinitions'
import type { SpecialEventId, OriginEligibility, OriginConfig, OriginState, OriginCompetitionFormat, OriginScheduleMode } from '@/types/specialEvents'
import { ALL_ORIGIN_STATES } from '@/types/specialEvents'

interface ClubData {
  id: string
  name: string
  fullName: string
  abbreviation: string
  mascot: string
  homeGround: string
  established?: number
  premierships?: number
  tier?: 'large' | 'medium' | 'small'
  colors: { primary: string; secondary: string; tertiary?: string }
}


const OFFSEASON_STAGE_START_OFFSETS: Record<OffseasonPhase, number> = {
  'season-end': 0,
  retirements: 7,
  delistings: 10,
  'trade-period': 14,
  'free-agency': 35,
  'national-draft': 49,
  'rookie-draft': 52,
  'supplemental-signing': 54,
  preseason: 56,
  'venue-allocation': 70,
  'practice-matches': 77,
  ready: 84,
}

const OFFSEASON_STAGE_OPTIONS: Array<{ value: OffseasonPhase; label: string }> = [
  { value: 'season-end', label: 'Awards Night' },
  { value: 'retirements', label: 'Retirements' },
  { value: 'delistings', label: 'Delistings' },
  { value: 'trade-period', label: 'Trade Period' },
  { value: 'free-agency', label: 'Free Agency' },
  { value: 'national-draft', label: 'National Draft' },
  { value: 'rookie-draft', label: 'Rookie Draft' },
  { value: 'supplemental-signing', label: 'Supplemental Signing' },
  { value: 'preseason', label: 'Preseason' },
  { value: 'venue-allocation', label: 'Venue Allocation' },
  { value: 'practice-matches', label: 'Practice Matches' },
  { value: 'ready', label: 'Season Ready' },
]

function getGameStartDateForStage(seasonStartDate: string, stage: OffseasonPhase | 'season-start'): string {
  if (stage === 'season-start') return seasonStartDate
  const year = parseInt(seasonStartDate.slice(0, 4), 10) || 2026
  const offseasonStartDate = computeDefaultGameStartDate(year)
  return addDays(offseasonStartDate, OFFSEASON_STAGE_START_OFFSETS[stage] ?? 0)
}

function inferOffseasonStageFromDate(seasonStartDate: string, gameStartDate: string): OffseasonPhase {
  const year = parseInt(seasonStartDate.slice(0, 4), 10) || 2026
  const offseasonStartDate = computeDefaultGameStartDate(year)
  const dayOffset = diffDays(offseasonStartDate, gameStartDate)
  let inferred: OffseasonPhase = 'season-end'
  for (const option of OFFSEASON_STAGE_OPTIONS) {
    const start = OFFSEASON_STAGE_START_OFFSETS[option.value]
    if (dayOffset >= start) inferred = option.value
  }
  return inferred
}

// ---------------------------------------------------------------------------
// Origin Config Panel
// ---------------------------------------------------------------------------

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

function OriginConfigPanel({
  config,
  onChange,
}: {
  config: OriginConfig
  onChange: (c: OriginConfig) => void
}) {
  const update = (patch: Partial<OriginConfig>) => onChange({ ...config, ...patch })

  const teamCount = getEffectiveTeamCount(config)
  const defaultMatchCount = computeDefaultMatchCount(config.format, teamCount)

  // Build summary text
  const alliesSet = new Set<string>(config.alliesEnabled ? config.alliesStates : [])
  const stateNames = config.participatingStates.filter((s) => !alliesSet.has(s))
  const summaryParts = [
    ORIGIN_FORMAT_LABELS[config.format],
    `${config.matchCount} match${config.matchCount !== 1 ? 'es' : ''}`,
    stateNames.join(', ') + (config.alliesEnabled ? ` + ${config.alliesName} (${config.alliesStates.join('/')})` : ''),
    `${config.matchDay.charAt(0).toUpperCase() + config.matchDay.slice(1)} nights`,
    config.scheduleMode === 'mid-season-block' ? 'mid-season' : config.scheduleMode,
  ]

  return (
    <div className="space-y-4 border-t border-zinc-800 pt-3">
      <div>
        <Label className="text-sm font-medium text-amber-400">State of Origin Configuration</Label>
        <p className="text-[10px] text-zinc-500 mt-1">{summaryParts.join(' — ')}</p>
      </div>

      {/* Competition Format */}
      <div className="space-y-1.5">
        <Label className="text-zinc-200">Competition Format</Label>
        <Select
          value={config.format}
          onValueChange={(val) => {
            const fmt = val as OriginCompetitionFormat
            const newCount = computeDefaultMatchCount(fmt, teamCount)
            update({ format: fmt, matchCount: newCount })
          }}
        >
          <SelectTrigger className="w-full border-zinc-700 bg-zinc-800 text-zinc-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ORIGIN_FORMAT_LABELS) as OriginCompetitionFormat[]).map((f) => (
              <SelectItem key={f} value={f}>{ORIGIN_FORMAT_LABELS[f]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Number of Matches */}
      <div className="space-y-1.5">
        <Label className="text-zinc-200">Number of Matches</Label>
        <p className="text-[10px] text-zinc-500">Default: {defaultMatchCount} for {ORIGIN_FORMAT_LABELS[config.format].toLowerCase()} with {teamCount} teams</p>
        <Input
          type="number"
          min={1}
          max={20}
          value={config.matchCount}
          onChange={(e) => update({ matchCount: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)) })}
          className="w-24 border-zinc-700 bg-zinc-800 text-zinc-200"
        />
      </div>

      {/* Participating States */}
      <div className="space-y-1.5">
        <Label className="text-zinc-200">Participating States</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ALL_ORIGIN_STATES.map((state) => {
            const checked = config.participatingStates.includes(state)
            return (
              <label key={state} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? config.participatingStates.filter((s) => s !== state)
                      : [...config.participatingStates, state]
                    const newTeamCount = getEffectiveTeamCount({ ...config, participatingStates: next })
                    const newMatchCount = computeDefaultMatchCount(config.format, newTeamCount)
                    update({ participatingStates: next, matchCount: newMatchCount })
                  }}
                  className="accent-amber-500"
                />
                {ORIGIN_STATE_LABELS[state]} ({state})
              </label>
            )
          })}
        </div>
      </div>

      {/* Allies Team */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-zinc-200">Allies Team</Label>
            <p className="text-xs text-zinc-500">Merge smaller states into a combined team</p>
          </div>
          <Switch
            checked={config.alliesEnabled}
            onCheckedChange={(val) => {
              const newConfig = { ...config, alliesEnabled: val }
              const newTeamCount = getEffectiveTeamCount(newConfig)
              const newMatchCount = computeDefaultMatchCount(config.format, newTeamCount)
              update({ alliesEnabled: val, matchCount: newMatchCount })
            }}
          />
        </div>
        {config.alliesEnabled && (
          <div className="space-y-2 pl-4 border-l-2 border-zinc-700">
            <div className="space-y-1">
              <Label className="text-zinc-400 text-xs">Team Name</Label>
              <Input
                value={config.alliesName}
                onChange={(e) => update({ alliesName: e.target.value || 'Allies' })}
                className="w-48 border-zinc-700 bg-zinc-800 text-zinc-200"
                placeholder="Allies"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-400 text-xs">States in Allies</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ALL_ORIGIN_STATES.map((state) => {
                  const checked = config.alliesStates.includes(state)
                  return (
                    <label key={state} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? config.alliesStates.filter((s) => s !== state)
                            : [...config.alliesStates, state]
                          const newConfig = { ...config, alliesStates: next }
                          const newTeamCount = getEffectiveTeamCount(newConfig)
                          const newMatchCount = computeDefaultMatchCount(config.format, newTeamCount)
                          update({ alliesStates: next, matchCount: newMatchCount })
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

      {/* Scheduling Mode */}
      <div className="space-y-1.5">
        <Label className="text-zinc-200">Scheduling</Label>
        <Select
          value={config.scheduleMode}
          onValueChange={(val) => update({ scheduleMode: val as OriginScheduleMode })}
        >
          <SelectTrigger className="w-full border-zinc-700 bg-zinc-800 text-zinc-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ORIGIN_SCHEDULE_LABELS) as OriginScheduleMode[]).map((m) => (
              <SelectItem key={m} value={m}>{ORIGIN_SCHEDULE_LABELS[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Match Day */}
      <div className="space-y-1.5">
        <Label className="text-zinc-200">Match Day</Label>
        <Select
          value={config.matchDay}
          onValueChange={(val) => update({ matchDay: val as 'tuesday' | 'wednesday' | 'thursday' })}
        >
          <SelectTrigger className="w-full border-zinc-700 bg-zinc-800 text-zinc-200">
            <SelectValue />
          </SelectTrigger>
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
            <Label className="text-zinc-200">Showdown Final</Label>
            <p className="text-xs text-zinc-500">Grand-final-adjacent showcase match between top 2 Origin teams</p>
          </div>
          <Switch
            checked={config.includeShowdownFinal}
            onCheckedChange={(val) => update({ includeShowdownFinal: val })}
          />
        </div>
        {config.includeShowdownFinal && (
          <div className="space-y-2 pl-4 border-l-2 border-zinc-700">
            <div className="space-y-1">
              <Label className="text-zinc-400 text-xs">Timing</Label>
              <Select
                value={config.showdownFinalTiming}
                onValueChange={(val) => update({ showdownFinalTiming: val as 'before-gf' | 'after-gf' })}
              >
                <SelectTrigger className="w-48 border-zinc-700 bg-zinc-800 text-zinc-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="before-gf">Before Grand Final</SelectItem>
                  <SelectItem value="after-gf">After Grand Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-400 text-xs">Venue</Label>
              <Select
                value={config.showdownFinalVenue}
                onValueChange={(val) => update({ showdownFinalVenue: val })}
              >
                <SelectTrigger className="w-48 border-zinc-700 bg-zinc-800 text-zinc-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GF_VENUES.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function NewGamePage() {
  const [managerName, setManagerName] = useState('')
  const [saveName, setSaveName] = useState('My Career')
  const [selectedClub, setSelectedClub] = useState<string | null>(null)
  const [startUnemployed, setStartUnemployed] = useState(false)
  const [clubSearch, setClubSearch] = useState('')
  const [settings, setSettings] = useState<GameSettings>(createDefaultSettings())

  const initializeGame = useGameStore((s) => s.initializeGame)
  const setScreen = useAppStore((s) => s.setScreen)
  const saveCurrentGame = useAppStore((s) => s.saveCurrentGame)
  const customLeagueTemplates = useAppStore((s) => s.customLeagueTemplates)
  const realClubs = clubsData as ClubData[]

  const [gameStartStage, setGameStartStage] = useState<OffseasonPhase | 'season-start'>(() =>
    inferOffseasonStageFromDate(settings.seasonStartDate, settings.gameStartDate),
  )

  const [fictionalClubs, setFictionalClubs] = useState<Club[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  const selectedTemplate: CustomLeagueTemplate | null = useMemo(
    () => customLeagueTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [customLeagueTemplates, selectedTemplateId],
  )

  const customTemplateClubs = useMemo(
    () => (selectedTemplate ? buildClubsFromTemplate(selectedTemplate) : []),
    [selectedTemplate],
  )

  const clubs = useMemo(() => {
    if (settings.leagueMode === 'fictional') {
      return fictionalClubs.map((c) => ({
        id: c.id, name: c.name, fullName: c.fullName, abbreviation: c.abbreviation,
        mascot: c.mascot, homeGround: c.homeGround, established: c.established,
        premierships: c.premierships, tier: c.tier, colors: c.colors,
      }))
    }
    if (settings.leagueMode === 'custom') {
      return customTemplateClubs.map((c) => ({
        id: c.id, name: c.name, fullName: c.fullName, abbreviation: c.abbreviation,
        mascot: c.mascot, homeGround: c.homeGround, established: c.established,
        premierships: c.premierships, tier: c.tier, colors: c.colors,
      }))
    }
    return realClubs
  }, [settings.leagueMode, fictionalClubs, customTemplateClubs, realClubs])

  const selectedClubData = useMemo(
    () => clubs.find((c) => c.id === selectedClub) ?? null,
    [clubs, selectedClub],
  )

  const previewStateLeagues = useMemo(() => {
    const clubRecord: Record<string, { id: string; name: string; abbreviation: string; colors: { primary: string; secondary: string }; homeGround: string }> = {}
    for (const club of clubs) {
      clubRecord[club.id] = {
        id: club.id, name: club.name, abbreviation: club.abbreviation,
        colors: { primary: club.colors.primary, secondary: club.colors.secondary },
        homeGround: club.homeGround,
      }
    }
    const initialized = initializeStateLeagues(clubRecord, 2026, 1, {
      namingTemplate: settings.leagueNamingTemplate,
      includePathways: settings.includePathwayLeagues,
    })
    return applyStateLeagueAffiliationSettings(initialized, settings.stateLeagueAffiliations) as Record<StateLeagueId, StateLeague>
  }, [clubs, settings.includePathwayLeagues, settings.leagueNamingTemplate, settings.stateLeagueAffiliations])

  const filteredClubs = useMemo(() => {
    if (!clubSearch.trim()) return clubs
    const query = clubSearch.toLowerCase()
    return clubs.filter(
      (club) =>
        club.name.toLowerCase().includes(query) ||
        club.fullName.toLowerCase().includes(query) ||
        club.mascot.toLowerCase().includes(query) ||
        club.homeGround.toLowerCase().includes(query),
    )
  }, [clubs, clubSearch])

  const handleStartGame = async () => {
    if (!selectedClub && !startUnemployed) return
    const customOverrideSettings = selectedTemplate
      ? {
        ...buildSettingsFromTemplate(selectedTemplate),
        leagueNamingTemplate: settings.leagueNamingTemplate,
        includePathwayLeagues: settings.includePathwayLeagues,
      }
      : settings
    const leagueConfigOverride: LeagueConfig | undefined = selectedTemplate
      ? buildLeagueConfigFromTemplate(selectedTemplate)
      : undefined
    const clubsOverride: Club[] | undefined =
      settings.leagueMode === 'fictional'
        ? fictionalClubs
        : settings.leagueMode === 'custom'
          ? customTemplateClubs
          : undefined

    initializeGame(
      selectedClub ?? '',
      saveName,
      settings.leagueMode === 'custom' ? customOverrideSettings : settings,
      clubsOverride,
      managerName.trim(),
      startUnemployed,
      leagueConfigOverride,
    )
    const gameState = useGameStore.getState()
    await saveCurrentGame(gameState)
    setScreen('game')
  }

  const handleResetSettings = () => {
    const defaults = createDefaultSettings()
    setSettings(defaults)
    setGameStartStage(inferOffseasonStageFromDate(defaults.seasonStartDate, defaults.gameStartDate))
  }

  const updateRealism = (key: keyof RealismSettings, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      difficulty: 'custom',
      realism: { ...prev.realism, [key]: value },
    }))
  }

  const handleSelectPreset = (presetId: string) => {
    const preset = DIFFICULTY_PRESETS.find((p) => p.id === presetId)
    if (preset) {
      setSettings((prev) => ({
        ...prev,
        ...preset.overrides,
        realism: { ...prev.realism, ...preset.overrides.realism },
      }))
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const handleGenerateFictional = () => {
    setFictionalClubs(generateFictionalLeague(settings.teamCount, Date.now()))
    setSelectedClub(null)
    setStartUnemployed(false)
  }

  const canStart = (selectedClub !== null || startUnemployed) && saveName.trim().length > 0

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950">
      {/* Slim header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-white"
          onClick={() => setScreen('home')}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Menu
        </Button>
        <p className="text-sm font-semibold text-zinc-300">
          AFL Manager <span className="text-zinc-600">·</span>{' '}
          <span className="font-normal text-zinc-500">New Career</span>
        </p>
        <div className="w-16" />
      </div>

      {/* Main content: two-column split */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Club Selection ────────────────────────── */}
        <div className="flex w-[58%] flex-col overflow-hidden border-r border-zinc-800">
          {/* Search bar */}
          <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={clubSearch}
                onChange={(e) => setClubSearch(e.target.value)}
                placeholder="Search clubs..."
                className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-800/50 pl-9 pr-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Club list */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {/* Start unemployed */}
            <button
              className={cn(
                'w-full rounded-lg border-2 p-3 text-left transition-all duration-200',
                startUnemployed
                  ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_16px_rgba(245,158,11,0.15)]'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600',
              )}
              onClick={() => { setStartUnemployed(true); setSelectedClub(null) }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-100">Start Unemployed</p>
                  <p className="text-xs text-zinc-400">Enter the coaching market without a club</p>
                </div>
                {startUnemployed && <CheckCircle2 className="h-5 w-5 shrink-0 text-amber-400" />}
              </div>
            </button>

            {/* Fictional: prompt to generate */}
            {settings.leagueMode === 'fictional' && fictionalClubs.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 py-10 text-center">
                <Shield className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
                <p className="text-sm text-zinc-400">Click &quot;Generate Clubs&quot; in the settings panel</p>
              </div>
            )}

            {/* Club grid */}
            {clubs.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {filteredClubs.map((club) => {
                  const isSelected = selectedClub === club.id
                  return (
                    <button
                      key={club.id}
                      className={cn(
                        'rounded-lg border-2 p-3 text-left transition-all duration-200 hover:scale-[1.01]',
                        isSelected
                          ? 'shadow-lg'
                          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-800/50',
                      )}
                      style={isSelected ? {
                        borderColor: club.colors.primary,
                        backgroundColor: ,
                        boxShadow: ,
                      } : undefined}
                      onClick={() => { setSelectedClub(club.id); setStartUnemployed(false) }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="h-8 w-8 shrink-0 rounded-full shadow-inner"
                          style={{ background:  }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={cn('truncate text-sm font-semibold', isSelected ? 'text-white' : 'text-zinc-200')}>
                            {club.fullName}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                            {club.premierships != null && (
                              <span className="flex items-center gap-0.5">
                                <Trophy className="h-2.5 w-2.5" />
                                {club.premierships}
                              </span>
                            )}
                            {club.established && <span>Est. {club.established}</span>}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2
                            className="h-4 w-4 shrink-0"
                            style={{ color: club.colors.primary }}
                          />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {filteredClubs.length === 0 && clubs.length > 0 && (
              <p className="py-8 text-center text-sm text-zinc-500">No clubs match your search.</p>
            )}
          </div>
        </div>

        {/* -- Right: Setup & Start -- */}
        <div className="flex w-[42%] flex-col overflow-hidden bg-zinc-950/50">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">

            {/* Selected club / state preview */}
            {startUnemployed ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="font-semibold text-amber-300">Starting Unemployed</p>
                <p className="mt-0.5 text-xs text-zinc-400">Apply for vacant coaching roles to begin</p>
              </div>
            ) : selectedClubData ? (
              <div
                className="rounded-lg border-2 p-4"
                style={{
                  borderColor: selectedClubData.colors.primary,
                  background: ,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 shrink-0 rounded-full shadow-md"
                    style={{ background:  }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-white">{selectedClubData.fullName}</p>
                    <p className="truncate text-xs text-zinc-400">{selectedClubData.homeGround}</p>
                    {selectedClubData.premierships != null && (
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
                        <Trophy className="h-3 w-3" />
                        {selectedClubData.premierships} premiership{selectedClubData.premierships !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-center">
                <Shield className="mx-auto mb-2 h-7 w-7 text-zinc-600" />
                <p className="text-sm text-zinc-500">Select a club on the left to begin</p>
              </div>
            )}

            {/* Manager details */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  Manager Name <span className="normal-case text-zinc-600">(optional)</span>
                </Label>
                <Input
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="Your name"
                  className="h-9 border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-600"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  Save Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="My Career"
                  className="h-9 border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-600"
                />
                {saveName.trim().length === 0 && (
                  <p className="text-[10px] text-red-400">Save name is required</p>
                )}
              </div>
            </div>

            {/* League Mode */}
            <div className="space-y-2">
              <Label className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">League</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: 'real' as const, label: 'Real AFL' },
                  { id: 'fictional' as const, label: 'Fictional' },
                  { id: 'custom' as const, label: 'Custom' },
                ]).map((mode) => (
                  <button
                    key={mode.id}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                      settings.leagueMode === mode.id
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200',
                    )}
                    onClick={() => {
                      setSettings((prev) => ({ ...prev, leagueMode: mode.id }))
                      setSelectedClub(null)
                      setStartUnemployed(false)
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              {settings.leagueMode === 'fictional' && (
                <div className="space-y-2.5 rounded-md border border-zinc-800 bg-zinc-900/30 p-3">
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-xs text-zinc-400">
                      Teams: <span className="font-bold text-zinc-200">{settings.teamCount}</span>
                    </span>
                    <Slider
                      value={[settings.teamCount]}
                      onValueChange={([val]) => setSettings((prev) => ({ ...prev, teamCount: val }))}
                      min={8}
                      max={24}
                      step={2}
                      className="flex-1"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-full border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800"
                    onClick={handleGenerateFictional}
                  >
                    <RotateCcw className="mr-1.5 h-3 w-3" />
                    {fictionalClubs.length > 0 ? 'Regenerate Clubs' : }
                  </Button>
                </div>
              )}
              {settings.leagueMode === 'custom' && (
                <div className="space-y-1.5">
                  {customLeagueTemplates.length === 0 ? (
                    <p className="text-xs text-zinc-500">No custom templates yet. Create one in the League Builder.</p>
                  ) : (
                    <Select
                      value={selectedTemplateId}
                      onValueChange={(val) => {
                        setSelectedTemplateId(val)
                        setSelectedClub(null)
                        setStartUnemployed(false)
                        const template = customLeagueTemplates.find((t) => t.id === val)
                        if (template) {
                          const templateSettings = buildSettingsFromTemplate(template)
                          setSettings((prev) => ({
                            ...templateSettings,
                            leagueNamingTemplate: prev.leagueNamingTemplate,
                            includePathwayLeagues: prev.includePathwayLeagues,
                          }))
                        }
                      }}
                    >
                      <SelectTrigger className="border-zinc-700 bg-zinc-800/50 text-white">
                        <SelectValue placeholder="Select a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {customLeagueTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <Label className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Difficulty</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {DIFFICULTY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                      settings.difficulty === preset.id
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200',
                    )}
                    onClick={() => handleSelectPreset(preset.id)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {settings.difficulty === 'custom' && (
                <p className="text-[10px] text-zinc-500">
                  Custom — you&apos;ve modified a preset value in Advanced Settings.
                </p>
              )}
            </div>

            {/* -- Advanced Settings -- */}
            <AdvancedSection label="Advanced Settings">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetSettings}
                  className="h-7 border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  <RotateCcw className="mr-1.5 h-3 w-3" />
                  Reset Defaults
                </Button>
              </div>

              {/* Season & Fixture */}
              <div className="space-y-4">
                <p className="border-b border-zinc-800 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Season &amp; Fixture
                </p>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">Regular Season Rounds</Label>
                      <p className="text-xs text-zinc-500">Home &amp; away season length</p>
                    </div>
                    <span className="w-8 text-right text-sm font-bold tabular-nums text-zinc-200">
                      {settings.seasonStructure.regularSeasonRounds}
                    </span>
                  </div>
                  <Slider
                    value={[settings.seasonStructure.regularSeasonRounds]}
                    onValueChange={([val]) =>
                      setSettings((prev) => ({
                        ...prev,
                        seasonStructure: { ...prev.seasonStructure, regularSeasonRounds: val },
                      }))
                    }
                    min={0} max={40} step={1}
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>0 (finals only)</span><span>23 (standard)</span><span>40</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-zinc-200">Bye Rounds</Label>
                    <p className="text-xs text-zinc-500">Mid-season rest weeks</p>
                  </div>
                  <Switch
                    checked={settings.seasonStructure.byeRounds}
                    onCheckedChange={(val) =>
                      setSettings((prev) => ({
                        ...prev,
                        seasonStructure: { ...prev.seasonStructure, byeRounds: val },
                      }))
                    }
                  />
                </div>
                {settings.seasonStructure.byeRounds && (
                  <div className="space-y-2 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-zinc-400">Bye Round Count</Label>
                      <span className="text-sm font-bold tabular-nums text-zinc-200">
                        {settings.seasonStructure.byeRoundCount}
                      </span>
                    </div>
                    <Slider
                      value={[settings.seasonStructure.byeRoundCount]}
                      onValueChange={([val]) =>
                        setSettings((prev) => ({
                          ...prev,
                          seasonStructure: { ...prev.seasonStructure, byeRoundCount: val },
                        }))
                      }
                      min={1} max={6} step={1}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-zinc-200">Game Start Stage</Label>
                  <Select
                    value={gameStartStage}
                    onValueChange={(val) => {
                      const stage = val as OffseasonPhase | 'season-start'
                      setGameStartStage(stage)
                      setSettings((prev) => ({
                        ...prev,
                        gameStartDate: getGameStartDateForStage(prev.seasonStartDate, stage),
                      }))
                    }}
                  >
                    <SelectTrigger className="w-full border-zinc-700 bg-zinc-800/50 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OFFSEASON_STAGE_OPTIONS.map((stage) => (
                        <SelectItem key={stage.value} value={stage.value}>
                          {stage.label} ({formatDate(getGameStartDateForStage(settings.seasonStartDate, stage.value))})
                        </SelectItem>
                      ))}
                      <SelectItem value="season-start">
                        Season Day 1 ({formatDate(settings.seasonStartDate)})
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="rounded-md border border-zinc-700 bg-zinc-800/30 px-3 py-1.5 text-sm text-zinc-200">
                    {formatDate(settings.gameStartDate)}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-200">Season Start Date</Label>
                  <Select
                    value={
                      settings.seasonStartDate === '2026-03-06' ? 'early-march' :
                      settings.seasonStartDate === '2026-03-20' ? 'mid-march' :
                      settings.seasonStartDate === '2026-03-27' ? 'late-march' :
                      settings.seasonStartDate === '2026-04-03' ? 'april' : 'custom'
                    }
                    onValueChange={(val) => {
                      const dateMap: Record<string, string> = {
                        'early-march': '2026-03-06', 'mid-march': '2026-03-20',
                        'late-march': '2026-03-27', 'april': '2026-04-03',
                      }
                      if (dateMap[val]) {
                        setSettings((prev) => {
                          const newDate = dateMap[val]
                          const updated = { ...prev, seasonStartDate: newDate }
                          updated.gameStartDate = getGameStartDateForStage(newDate, gameStartStage)
                          return updated
                        })
                      }
                    }}
                  >
                    <SelectTrigger className="w-full border-zinc-700 bg-zinc-800/50 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="early-march">Early March (Mar 6)</SelectItem>
                      <SelectItem value="mid-march">Mid March (Mar 20) — Default</SelectItem>
                      <SelectItem value="late-march">Late March (Mar 27)</SelectItem>
                      <SelectItem value="april">April (Apr 3)</SelectItem>
                      <SelectItem value="custom">Custom...</SelectItem>
                    </SelectContent>
                  </Select>
                  {!['2026-03-06', '2026-03-20', '2026-03-27', '2026-04-03'].includes(settings.seasonStartDate) && (
                    <Input
                      type="date"
                      value={settings.seasonStartDate}
                      onChange={(e) =>
                        setSettings((prev) => {
                          const newDate = e.target.value
                          const updated = { ...prev, seasonStartDate: newDate }
                          updated.gameStartDate = getGameStartDateForStage(newDate, gameStartStage)
                          return updated
                        })
                      }
                      className="border-zinc-700 bg-zinc-800/50 text-white"
                    />
                  )}
                </div>

                <FinalsFormatEditor
                  finals={settings.finals}
                  onChange={(finals) => setSettings((prev) => ({ ...prev, finals }))}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">Special Events</Label>
                      <p className="text-xs text-zinc-500">Exhibition matches throughout the season</p>
                    </div>
                    <Switch
                      checked={settings.specialEvents.enabled}
                      onCheckedChange={(val) =>
                        setSettings((prev) => ({
                          ...prev,
                          specialEvents: { ...prev.specialEvents, enabled: val },
                        }))
                      }
                    />
                  </div>
                  {settings.specialEvents.enabled && (
                    <div className="space-y-3 border-t border-zinc-800 pt-3">
                      {SPECIAL_EVENT_DEFINITIONS.map((def) => (
                        <div key={def.id} className="flex items-center justify-between">
                          <div>
                            <Label className="text-zinc-200">{def.name}</Label>
                            <p className="text-xs text-zinc-500">{def.description}</p>
                          </div>
                          <Switch
                            checked={settings.specialEvents.events[def.id as SpecialEventId]}
                            onCheckedChange={(val) =>
                              setSettings((prev) => ({
                                ...prev,
                                specialEvents: {
                                  ...prev.specialEvents,
                                  events: { ...prev.specialEvents.events, [def.id]: val },
                                },
                              }))
                            }
                          />
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                        <div>
                          <Label className="text-zinc-200">Auto-Schedule</Label>
                          <p className="text-xs text-zinc-500">Automatically place events at realistic dates</p>
                        </div>
                        <Switch
                          checked={settings.specialEvents.autoSchedule}
                          onCheckedChange={(val) =>
                            setSettings((prev) => ({
                              ...prev,
                              specialEvents: { ...prev.specialEvents, autoSchedule: val },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5 border-t border-zinc-800 pt-3">
                        <Label className="text-zinc-200">Origin Eligibility</Label>
                        <Select
                          value={settings.specialEvents.originEligibility}
                          onValueChange={(val) =>
                            setSettings((prev) => ({
                              ...prev,
                              specialEvents: {
                                ...prev.specialEvents,
                                originEligibility: val as OriginEligibility,
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="w-full border-zinc-700 bg-zinc-800 text-zinc-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="birthplace">Birthplace / Pathway</SelectItem>
                            <SelectItem value="current-club">Current Club State</SelectItem>
                            <SelectItem value="state-league">State League Affiliation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {settings.specialEvents.events['state-of-origin'] && (
                        <OriginConfigPanel
                          config={settings.specialEvents.originConfig ?? DEFAULT_ORIGIN_CONFIG}
                          onChange={(newConfig) =>
                            setSettings((prev) => ({
                              ...prev,
                              specialEvents: { ...prev.specialEvents, originConfig: newConfig },
                            }))
                          }
                        />
                      )}
                    </div>
                  )}
                </div>

                <MatchSlotGrid
                  slots={settings.fixtureSchedule.matchSlots}
                  onChange={(matchSlots) =>
                    setSettings((prev) => ({
                      ...prev,
                      fixtureSchedule: { ...prev.fixtureSchedule, matchSlots },
                    }))
                  }
                />
                {settings.leagueMode === 'real' && (
                  <BlockbusterEditor
                    blockbusters={settings.blockbusters}
                    onChange={(blockbusters) => setSettings((prev) => ({ ...prev, blockbusters }))}
                  />
                )}
              </div>

              {/* Match & List Rules */}
              <div className="space-y-4 border-t border-zinc-800 pt-4">
                <p className="border-b border-zinc-800 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Match &amp; List Rules
                </p>

                <div className="flex gap-4">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-zinc-200">Points per Goal</Label>
                    <p className="text-xs text-zinc-500">Standard: 6</p>
                    <Input
                      type="number"
                      value={settings.matchRules.pointsPerGoal}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          matchRules: {
                            ...prev.matchRules,
                            pointsPerGoal: Math.max(1, parseInt(e.target.value, 10) || 1),
                          },
                        }))
                      }
                      className="w-20 border-zinc-700 bg-zinc-800/50 text-center text-white"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-zinc-200">Points per Behind</Label>
                    <p className="text-xs text-zinc-500">Standard: 1</p>
                    <Input
                      type="number"
                      value={settings.matchRules.pointsPerBehind}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          matchRules: {
                            ...prev.matchRules,
                            pointsPerBehind: Math.max(0, parseInt(e.target.value, 10) || 0),
                          },
                        }))
                      }
                      className="w-20 border-zinc-700 bg-zinc-800/50 text-center text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">Interchange Players</Label>
                      <p className="text-xs text-zinc-500">
                        Squad: {18 + settings.matchRules.interchangePlayers + (settings.matchRules.enableSubstitutes ? 1 : 0)}
                      </p>
                    </div>
                    <span className="w-6 text-right text-sm font-bold tabular-nums text-zinc-200">
                      {settings.matchRules.interchangePlayers}
                    </span>
                  </div>
                  <Slider
                    value={[settings.matchRules.interchangePlayers]}
                    onValueChange={([val]) =>
                      setSettings((prev) => ({
                        ...prev,
                        matchRules: { ...prev.matchRules, interchangePlayers: val },
                      }))
                    }
                    min={0} max={8} step={1}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-zinc-200">Match-Day Substitute</Label>
                    <p className="text-xs text-zinc-500">Tactical sub that can be activated in-game</p>
                  </div>
                  <Switch
                    checked={settings.matchRules.enableSubstitutes}
                    onCheckedChange={(val) =>
                      setSettings((prev) => ({
                        ...prev,
                        matchRules: { ...prev.matchRules, enableSubstitutes: val },
                      }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-200">Quarters per Match</Label>
                  <Select
                    value={String(settings.matchRules.quartersPerMatch)}
                    onValueChange={(val) =>
                      setSettings((prev) => ({
                        ...prev,
                        matchRules: { ...prev.matchRules, quartersPerMatch: parseInt(val, 10) },
                      }))
                    }
                  >
                    <SelectTrigger className="border-zinc-700 bg-zinc-800/50 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Halves</SelectItem>
                      <SelectItem value="3">3 Thirds</SelectItem>
                      <SelectItem value="4">4 Quarters (standard)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">Match Length</Label>
                      <p className="text-xs text-zinc-500">
                        ~{Math.round(140 * settings.matchRules.possessionsMultiplier)} possessions/quarter
                      </p>
                    </div>
                    <span className="w-10 text-right text-sm font-bold tabular-nums text-zinc-200">
                      {settings.matchRules.possessionsMultiplier.toFixed(1)}x
                    </span>
                  </div>
                  <Slider
                    value={[settings.matchRules.possessionsMultiplier * 10]}
                    onValueChange={([val]) =>
                      setSettings((prev) => ({
                        ...prev,
                        matchRules: { ...prev.matchRules, possessionsMultiplier: val / 10 },
                      }))
                    }
                    min={5} max={20} step={1}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-200">Ladder Points</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Win', key: 'pointsForWin' as const },
                      { label: 'Draw', key: 'pointsForDraw' as const },
                      { label: 'Loss', key: 'pointsForLoss' as const },
                    ].map(({ label, key }) => (
                      <div key={key}>
                        <Label className="text-xs text-zinc-500">{label}</Label>
                        <Input
                          type="number"
                          value={settings.ladderPoints[key]}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              ladderPoints: { ...prev.ladderPoints, [key]: parseInt(e.target.value, 10) || 0 },
                            }))
                          }
                          className="border-zinc-600 bg-zinc-700/50 text-center text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-zinc-200">Senior List</Label>
                      <span className="text-sm font-bold tabular-nums text-zinc-200">{settings.listRules.seniorListSize}</span>
                    </div>
                    <Slider
                      value={[settings.listRules.seniorListSize]}
                      onValueChange={([val]) =>
                        setSettings((prev) => ({ ...prev, listRules: { ...prev.listRules, seniorListSize: val } }))
                      }
                      min={30} max={46} step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-zinc-200">Rookie List</Label>
                      <span className="text-sm font-bold tabular-nums text-zinc-200">{settings.listRules.rookieListSize}</span>
                    </div>
                    <Slider
                      value={[settings.listRules.rookieListSize]}
                      onValueChange={([val]) =>
                        setSettings((prev) => ({ ...prev, listRules: { ...prev.listRules, rookieListSize: val } }))
                      }
                      min={2} max={10} step={1}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-200">Grand Final Venue</Label>
                  <div className="space-y-1.5">
                    {([
                      { value: 'fixed' as const, label: 'Fixed Venue', desc: 'Same venue every year' },
                      { value: 'random' as const, label: 'Random Rotation', desc: 'Random major venue each season' },
                      { value: 'top-club' as const, label: 'Home of Top Club', desc: 'Highest-finishing team hosts' },
                    ]).map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors',
                          settings.finals.grandFinalVenueMode === opt.value
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-zinc-700 bg-zinc-800/30 hover:border-zinc-600',
                        )}
                      >
                        <input
                          type="radio"
                          name="gfVenueMode"
                          checked={settings.finals.grandFinalVenueMode === opt.value}
                          onChange={() =>
                            setSettings((prev) => ({
                              ...prev,
                              finals: { ...prev.finals, grandFinalVenueMode: opt.value },
                            }))
                          }
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{opt.label}</p>
                          <p className="text-xs text-zinc-500">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {settings.finals.grandFinalVenueMode === 'fixed' && (
                    <Select
                      value={settings.finals.grandFinalVenue}
                      onValueChange={(val) =>
                        setSettings((prev) => ({
                          ...prev,
                          finals: { ...prev.finals, grandFinalVenue: val },
                        }))
                      }
                    >
                      <SelectTrigger className="mt-2 w-full border-zinc-700 bg-zinc-800/50 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GF_VENUES.map((venue) => (
                          <SelectItem key={venue} value={venue}>{venue}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Rules & Realism */}
              <div className="space-y-4 border-t border-zinc-800 pt-4">
                <p className="border-b border-zinc-800 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Rules &amp; Realism
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">Salary Cap</Label>
                      <p className="text-xs text-zinc-500">AFL 2026: $18.3M</p>
                    </div>
                    <Switch
                      checked={settings.salaryCap}
                      onCheckedChange={(val) =>
                        setSettings((prev) => ({ ...prev, salaryCap: val, difficulty: 'custom' }))
                      }
                    />
                  </div>
                  {settings.salaryCap && (
                    <div className="space-y-1.5 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-zinc-400">Cap Amount</Label>
                        <span className="text-sm font-bold text-zinc-200">{formatCurrency(settings.salaryCapAmount)}</span>
                      </div>
                      <Slider
                        value={[settings.salaryCapAmount]}
                        onValueChange={([val]) =>
                          setSettings((prev) => ({ ...prev, salaryCapAmount: val, difficulty: 'custom' }))
                        }
                        min={10_000_000} max={25_000_000} step={100_000}
                      />
                    </div>
                  )}
                </div>

                <AffiliateManagementEditor
                  clubs={clubs.map((club) => ({
                    id: club.id,
                    name: club.name,
                    abbreviation: club.abbreviation,
                  }))}
                  stateLeagues={previewStateLeagues}
                  value={settings.stateLeagueAffiliations}
                  onChange={(next) =>
                    setSettings((prev) => ({ ...prev, stateLeagueAffiliations: next }))
                  }
                  title="State League Affiliate Management"
                  description="Swap AFL club affiliate leagues before starting your save."
                />

                {[
                  { group: 'Player Behavior', items: [
                    { key: 'playerLoyalty' as const, label: 'Player Loyalty', desc: 'Loyalty affects contract discounts & trade reluctance' },
                    { key: 'tradeRequests' as const, label: 'Trade Requests', desc: 'Unhappy players nominate preferred clubs' },
                    { key: 'nominatedTradeDestinations' as const, label: 'Nominated Destinations', desc: 'Trade-requesting players nominate destination clubs' },
                    { key: 'reducedNominatedLeverage' as const, label: 'Reduced Nominated Leverage', desc: 'Nominated player trade return can be discounted' },
                    { key: 'playersRefuseTrades' as const, label: 'Players Refuse Trades', desc: 'Players can refuse moves to unwanted clubs' },
                    { key: 'playerRoleDisputes' as const, label: 'Role Disputes', desc: 'Players lose morale when played out of position' },
                  ]},
                  { group: 'Trading & Contracts', items: [
                    { key: 'salaryDumpTrades' as const, label: 'Salary Dump Trades', desc: 'Clubs offload big contracts with dead cap penalties' },
                    { key: 'softCapSpending' as const, label: 'Soft Cap Spending', desc: 'Clubs can exceed salary cap with luxury tax' },
                    { key: 'mediaLeaks' as const, label: 'Media Leaks', desc: 'Player managers leak negotiations to the media' },
                    { key: 'negotiationDelays' as const, label: 'Negotiation Delays', desc: 'Multi-round delays (off = instant resolution)' },
                  ]},
                  { group: 'Draft & Development', items: [
                    { key: 'draftVariance' as const, label: 'Draft Variance', desc: 'Top picks can bust, late picks can bloom' },
                    { key: 'ngaAcademy' as const, label: 'NGA / Academy', desc: 'Father-Son and Academy matching bid system' },
                    { key: 'ngaAcademyZoneMatching' as const, label: 'Zone Matching Rules', desc: 'Apply academy/NGA zone eligibility to matching bids' },
                  ]},
                  { group: 'League Operations', items: [
                    { key: 'fixtureBlockbusterBias' as const, label: 'Fixture Blockbuster Bias', desc: 'Named matches get prime scheduling priority' },
                    { key: 'fixtureRivalryScheduling' as const, label: 'Rivalry Scheduling', desc: 'Traditional rivals guaranteed to play twice per season' },
                    { key: 'venueScheduling' as const, label: 'Venue Scheduling', desc: 'Shared venue allocation, sold games, dynamic home advantage' },
                    { key: 'coachingCarousel' as const, label: 'Coaching Carousel', desc: 'Poor-performing AI coaches get sacked' },
                    { key: 'boardPressure' as const, label: 'Board Pressure', desc: 'Board expectations affect your job security' },
                    { key: 'boardPolitics' as const, label: 'Board Politics', desc: 'Internal factions can sway sackings and hiring outcomes' },
                    { key: 'listSizeEnforcement' as const, label: 'List Size Enforcement', desc: 'Enforce senior (38) and rookie (6) list limits' },
                    { key: 'aflHouseInterference' as const, label: 'AFL House Interference', desc: 'AFL mandates priority picks & scheduling for struggling clubs' },
                    { key: 'aflHouseExpansionEvolution' as const, label: 'Expansion Evolution', desc: 'AFL House may add new clubs over time' },
                    { key: 'aflHouseCompetitionEvolution' as const, label: 'Competition Evolution', desc: 'AFL House may switch competition models' },
                    { key: 'aflHouseFinalsEvolution' as const, label: 'Finals Evolution', desc: 'AFL House may change finals format between seasons' },
                    { key: 'aflHouseListRulesEvolution' as const, label: 'List Rules Evolution', desc: 'AFL House may adjust list limits' },
                    { key: 'aflHouseSalaryCapEvolution' as const, label: 'Salary Cap Evolution', desc: 'AFL House may revise salary cap year-to-year' },
                    { key: 'aflHouseFixtureEvolution' as const, label: 'Fixture Evolution', desc: 'AFL House may tweak fixture and season structure' },
                  ]},
                  { group: 'Awards & Events', items: [
                    { key: 'brownlowNight' as const, label: 'Brownlow Night', desc: 'Votes hidden until the ceremony before the Grand Final' },
                    { key: 'specialEventPlayerImpact' as const, label: 'Exhibition Match Impact', desc: 'Special events affect fatigue, injury risk, and form' },
                  ]},
                ].map(({ group, items }) => (
                  <div key={group} className="space-y-3 border-t border-zinc-800 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{group}</p>
                    {items.map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">{label}</Label>
                          <p className="text-xs text-zinc-500">{desc}</p>
                        </div>
                        <Switch checked={settings.realism[key]} onCheckedChange={(val) => updateRealism(key, val)} />
                      </div>
                    ))}
                  </div>
                ))}

                <div className="grid grid-cols-3 gap-3 border-t border-zinc-800 pt-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-200">Injuries</Label>
                    <Select
                      value={settings.injuryFrequency}
                      onValueChange={(val) =>
                        setSettings((prev) => ({
                          ...prev,
                          injuryFrequency: val as GameSettings['injuryFrequency'],
                          difficulty: 'custom',
                        }))
                      }
                    >
                      <SelectTrigger className="border-zinc-700 bg-zinc-800/50 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-200">Development</Label>
                    <Select
                      value={settings.developmentSpeed}
                      onValueChange={(val) =>
                        setSettings((prev) => ({
                          ...prev,
                          developmentSpeed: val as GameSettings['developmentSpeed'],
                          difficulty: 'custom',
                        }))
                      }
                    >
                      <SelectTrigger className="border-zinc-700 bg-zinc-800/50 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">Slow</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="fast">Fast</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-200">Sim Speed</Label>
                    <Select
                      value={settings.simSpeed}
                      onValueChange={(val) =>
                        setSettings((prev) => ({ ...prev, simSpeed: val as GameSettings['simSpeed'] }))
                      }
                    >
                      <SelectTrigger className="border-zinc-700 bg-zinc-800/50 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant</SelectItem>
                        <SelectItem value="fast">Fast</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 border-t border-zinc-800 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">League Universe</p>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-200">Naming Template</Label>
                    <Select
                      value={settings.leagueNamingTemplate}
                      onValueChange={(val) =>
                        setSettings((prev) => ({
                          ...prev,
                          leagueNamingTemplate: val as GameSettings['leagueNamingTemplate'],
                        }))
                      }
                    >
                      <SelectTrigger className="border-zinc-700 bg-zinc-800/50 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="real-life">Real-life-style</SelectItem>
                        <SelectItem value="fictional">Fictional naming</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">U16/U18 Pathways</Label>
                      <p className="text-xs text-zinc-500">Enable underage competitions in the world simulation</p>
                    </div>
                    <Switch
                      checked={settings.includePathwayLeagues}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({ ...prev, includePathwayLeagues: checked }))
                      }
                    />
                  </div>
                </div>
              </div>
            </AdvancedSection>
          </div>

          {/* Sticky footer: Start Game */}
          <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 p-4">
            <Button
              className="w-full bg-emerald-600 py-5 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-30"
              disabled={!canStart}
              onClick={handleStartGame}
            >
              <Play className="mr-2 h-5 w-5" />
              Start Game
            </Button>
            {!canStart && (
              <p className="mt-1.5 text-center text-[10px] text-zinc-600">
                {saveName.trim() === ''
                  ? 'Enter a save name above'
                  : 'Select a club on the left to begin'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

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
  ChevronRight,
  ChevronLeft,
  User,
  Shield,
  Calendar,
  Swords,
  Settings,
  CheckCircle2,
  Search,
  RotateCcw,
  Play,
  MapPin,
  Pencil,
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

const STEPS = [
  { number: 1, label: 'Manager', icon: User },
  { number: 2, label: 'League', icon: Shield },
  { number: 3, label: 'Club', icon: Shield },
  { number: 4, label: 'Season', icon: Calendar },
  { number: 5, label: 'Rules', icon: Swords },
  { number: 6, label: 'Settings', icon: Settings },
  { number: 7, label: 'Confirm', icon: CheckCircle2 },
] as const

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

function getGameStartDateForStage(seasonStartDate: string, stage: OffseasonPhase): string {
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
  const [currentStep, setCurrentStep] = useState(1)
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

  const [gameStartStage, setGameStartStage] = useState<OffseasonPhase>(() =>
    inferOffseasonStageFromDate(settings.seasonStartDate, settings.gameStartDate),
  )

  // League mode state
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

  // Derive available clubs based on league mode
  const clubs = useMemo(() => {
    if (settings.leagueMode === 'fictional') {
      return fictionalClubs.map((c) => ({
        id: c.id,
        name: c.name,
        fullName: c.fullName,
        abbreviation: c.abbreviation,
        mascot: c.mascot,
        homeGround: c.homeGround,
        established: c.established,
        premierships: c.premierships,
        tier: c.tier,
        colors: c.colors,
      }))
    }
    if (settings.leagueMode === 'custom') {
      return customTemplateClubs.map((c) => ({
        id: c.id,
        name: c.name,
        fullName: c.fullName,
        abbreviation: c.abbreviation,
        mascot: c.mascot,
        homeGround: c.homeGround,
        established: c.established,
        premierships: c.premierships,
        tier: c.tier,
        colors: c.colors,
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
        id: club.id,
        name: club.name,
        abbreviation: club.abbreviation,
        colors: {
          primary: club.colors.primary,
          secondary: club.colors.secondary,
        },
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

  const canAdvance = (step: number): boolean => {
    switch (step) {
      case 1:
        return saveName.trim().length > 0
      case 2:
        return settings.leagueMode !== 'custom' || Boolean(selectedTemplate)
      case 3:
        return selectedClub !== null || startUnemployed
      case 4:
        return true
      case 5:
        return true
      case 6:
        return true
      default:
        return false
    }
  }

  const handleNext = () => {
    if (canAdvance(currentStep) && currentStep < 7) {
      // When leaving league step, generate fictional clubs if needed
      if (currentStep === 2 && settings.leagueMode === 'fictional') {
        setFictionalClubs(generateFictionalLeague(settings.teamCount, Date.now()))
        setSelectedClub(null)
        setStartUnemployed(false)
      }
      if (currentStep === 2 && settings.leagueMode === 'custom') {
        setSelectedClub(null)
        setStartUnemployed(false)
        if (selectedTemplate) {
          const templateSettings = buildSettingsFromTemplate(selectedTemplate)
          setSettings((prev) => ({
            ...templateSettings,
            leagueNamingTemplate: prev.leagueNamingTemplate,
            includePathwayLeagues: prev.includePathwayLeagues,
          }))
        }
      }
      setCurrentStep((s) => s + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1)
    }
  }

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
    // Save the new game to a slot and navigate to game screen
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

  const totalSteps = STEPS.length

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-white"
              onClick={() => setScreen('home')}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to Menu
            </Button>
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                AFL Manager
              </h1>
              <p className="mt-1 text-sm text-zinc-400">Create a new career</p>
            </div>
            <div className="w-[120px]" /> {/* Spacer for centering */}
          </div>
        </div>
      </div>

      {/* Step Indicators */}
      <div className="border-b border-zinc-800 bg-zinc-950/50">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          {STEPS.map((step, i) => {
            const StepIcon = step.icon
            const isActive = currentStep === step.number
            const isCompleted = currentStep > step.number
            return (
              <div key={step.number} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => isCompleted && setCurrentStep(step.number)}
                    disabled={!isCompleted}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300',
                      isActive
                        ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                        : isCompleted
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400 cursor-pointer hover:bg-emerald-500/30'
                          : 'border-zinc-700 bg-zinc-800/50 text-zinc-500',
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <StepIcon className="h-4 w-4" />
                    )}
                  </button>
                  <span
                    className={cn(
                      'text-[10px] font-medium transition-colors duration-300',
                      isActive
                        ? 'text-blue-400'
                        : isCompleted
                          ? 'text-emerald-400'
                          : 'text-zinc-500',
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'mx-2 h-px w-6 transition-colors duration-300 sm:mx-4 sm:w-12',
                      currentStep > step.number ? 'bg-emerald-500/50' : 'bg-zinc-700',
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-8">
        <div className="w-full max-w-4xl">
          {/* Step 1: Manager Profile */}
          {currentStep === 1 && (
            <div className="mx-auto max-w-md space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">Manager Profile</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Set up your identity and save file
                </p>
              </div>

              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Details</CardTitle>
                  <CardDescription>
                    Enter your name and choose a save name for this career.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="managerName" className="text-zinc-300">
                      Manager Name
                      <span className="ml-1 text-xs text-zinc-500">(optional)</span>
                    </Label>
                    <Input
                      id="managerName"
                      value={managerName}
                      onChange={(e) => setManagerName(e.target.value)}
                      placeholder="Enter your name"
                      className="border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="saveName" className="text-zinc-300">
                      Save Name
                      <span className="ml-1 text-xs text-red-400">*</span>
                    </Label>
                    <Input
                      id="saveName"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="My Career"
                      className="border-zinc-700 bg-zinc-800/50 text-white placeholder:text-zinc-500"
                    />
                    {saveName.trim().length === 0 && (
                      <p className="text-xs text-red-400">A save name is required</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: League Setup */}
          {currentStep === 2 && (
            <div className="mx-auto max-w-md space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">League Setup</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Choose your league format
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {([
                  {
                    id: 'real' as const,
                    label: 'Real AFL',
                    description: 'Play with all 18 real AFL clubs',
                  },
                  {
                    id: 'fictional' as const,
                    label: 'Fictional League',
                    description: 'Procedurally generated clubs and players',
                  },
                  {
                    id: 'custom' as const,
                    label: 'Custom Template',
                    description: 'Use a saved custom world from the League Builder',
                  },
                ]).map((mode) => (
                  <Card
                    key={mode.id}
                    className={cn(
                      'cursor-pointer border-2 transition-all duration-200',
                      settings.leagueMode === mode.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600',
                    )}
                    onClick={() => setSettings((prev) => ({ ...prev, leagueMode: mode.id }))}
                  >
                    <CardContent className="p-4">
                      <p
                        className={cn(
                          'text-lg font-bold',
                          settings.leagueMode === mode.id ? 'text-blue-400' : 'text-zinc-200',
                        )}
                      >
                        {mode.label}
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">{mode.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">League Universe Template</CardTitle>
                  <CardDescription>Run real-life-style or fictional naming across state and pathway leagues.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      <p className="text-xs text-zinc-500">Enable underage competitions in the same world simulation.</p>
                    </div>
                    <Switch
                      checked={settings.includePathwayLeagues}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({
                          ...prev,
                          includePathwayLeagues: checked,
                        }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {settings.leagueMode === 'fictional' && (
                <Card className="border-zinc-800 bg-zinc-900/50">
                  <CardHeader>
                    <CardTitle className="text-white">League Size</CardTitle>
                    <CardDescription>Choose how many teams in your league</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-zinc-200">Number of Teams</Label>
                      <span className="text-sm font-bold tabular-nums text-zinc-200">
                        {settings.teamCount}
                      </span>
                    </div>
                    <Slider
                      value={[settings.teamCount]}
                      onValueChange={([val]) =>
                        setSettings((prev) => ({ ...prev, teamCount: val }))
                      }
                      min={8}
                      max={24}
                      step={2}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-500">
                      <span>8 teams</span>
                      <span>18 (standard)</span>
                      <span>24 teams</span>
                    </div>
                    <p className="text-xs text-blue-400">
                      {settings.teamCount} teams will be generated
                    </p>
                  </CardContent>
                </Card>
              )}

              {settings.leagueMode === 'custom' && (
                <Card className="border-zinc-800 bg-zinc-900/50">
                  <CardHeader>
                    <CardTitle className="text-white">Custom Template</CardTitle>
                    <CardDescription>Select a saved custom world</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger className="border-zinc-700 bg-zinc-800/50 text-white">
                        <SelectValue placeholder="Choose template" />
                      </SelectTrigger>
                      <SelectContent>
                        {customLeagueTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex justify-between">
                      <p className="text-xs text-zinc-400">
                        {selectedTemplate
                          ? `${selectedTemplate.teams.length} teams, ${selectedTemplate.fixtureRules.roundCount} rounds`
                          : 'No template selected'}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-zinc-700 bg-zinc-800/50 text-zinc-100"
                        onClick={() => setScreen('custom-league-builder')}
                      >
                        Open Builder
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 3: Select Club */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">Select Your Club</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Choose a club now, or begin unemployed and enter the coaching market
                </p>
              </div>

              <div className="mx-auto max-w-2xl">
                <Card
                  className={cn(
                    'cursor-pointer border-2 transition-all duration-200',
                    startUnemployed
                      ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600',
                  )}
                  onClick={() => {
                    setStartUnemployed(true)
                    setSelectedClub(null)
                  }}
                >
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold text-zinc-100">Start Unemployed</p>
                      <p className="text-xs text-zinc-400">
                        Begin without a club and apply for vacant senior coaching roles.
                      </p>
                    </div>
                    {startUnemployed && <CheckCircle2 className="h-5 w-5 text-amber-400" />}
                  </CardContent>
                </Card>
              </div>

              <div className="mx-auto max-w-sm">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    value={clubSearch}
                    onChange={(e) => setClubSearch(e.target.value)}
                    placeholder="Search clubs..."
                    className="border-zinc-700 bg-zinc-800/50 pl-9 text-white placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredClubs.map((club) => {
                  const isSelected = selectedClub === club.id
                  return (
                    <Card
                      key={club.id}
                      className={cn(
                        'cursor-pointer border-2 transition-all duration-200 hover:scale-[1.02]',
                        isSelected
                          ? 'shadow-lg'
                          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-800/50',
                      )}
                      style={
                        isSelected
                          ? {
                              borderColor: club.colors.primary,
                              backgroundColor: `${club.colors.primary}10`,
                              boxShadow: `0 0 20px ${club.colors.primary}25`,
                            }
                          : undefined
                      }
                      onClick={() => {
                        setSelectedClub(club.id)
                        setStartUnemployed(false)
                      }}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        <div
                          className="h-10 w-10 shrink-0 rounded-full shadow-inner"
                          style={{
                            background: `linear-gradient(135deg, ${club.colors.primary} 50%, ${club.colors.secondary} 50%)`,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p
                              className={cn(
                                'truncate font-semibold',
                                isSelected ? 'text-white' : 'text-zinc-200',
                              )}
                            >
                              {club.fullName}
                            </p>
                            {club.tier && (
                              <span className={cn(
                                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
                                club.tier === 'large' ? 'bg-amber-500/20 text-amber-400' :
                                club.tier === 'medium' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-zinc-500/20 text-zinc-400',
                              )}>
                                {club.tier}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-500">
                            {club.established && (
                              <span>Est. {club.established}</span>
                            )}
                            {club.premierships != null && (
                              <span className="flex items-center gap-0.5">
                                <Trophy className="h-3 w-3" />
                                {club.premierships}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{club.homeGround}</span>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2
                            className="h-5 w-5 shrink-0"
                            style={{ color: club.colors.primary }}
                          />
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {filteredClubs.length === 0 && (
                <p className="text-center text-sm text-zinc-500">
                  No clubs match your search.
                </p>
              )}
            </div>
          )}

          {/* Step 4: Season & Fixture */}
          {currentStep === 4 && (
            <div className="mx-auto max-w-lg space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">Season & Fixture</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Configure season structure and fixture scheduling
                </p>
              </div>

              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Season Structure</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Number of Rounds */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-zinc-200">Regular Season Rounds</Label>
                        <p className="text-xs text-zinc-500">
                          How many rounds in the home & away season
                        </p>
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
                      min={0}
                      max={40}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-500">
                      <span>0 (finals only)</span>
                      <span>23 (standard)</span>
                      <span>40 rounds</span>
                    </div>
                    {settings.seasonStructure.regularSeasonRounds === 0 && (
                      <p className="text-xs text-amber-400">
                        Exhibition mode: skip regular season, go straight to finals
                      </p>
                    )}
                  </div>

                  {/* Bye Rounds */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-zinc-200">Bye Rounds</Label>
                        <p className="text-xs text-zinc-500">
                          Mid-season rest weeks for clubs
                        </p>
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
                      <div className="space-y-2 ml-0 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-zinc-400">Bye Rounds</Label>
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
                          min={1}
                          max={6}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-500">
                          <span>1 round</span>
                          <span>3 (AFL standard)</span>
                          <span>6 rounds</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Game Start Stage */}
                  <div className="space-y-1.5">
                    <div>
                      <Label className="text-zinc-200">Game Start Stage</Label>
                      <p className="text-xs text-zinc-500">
                        Choose which offseason stage to begin from. The date is set automatically.
                      </p>
                    </div>
                    <Select
                      value={gameStartStage}
                      onValueChange={(val) => {
                        const stage = val as OffseasonPhase
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
                      </SelectContent>
                    </Select>
                    <p className="rounded-md border border-zinc-700 bg-zinc-800/30 px-3 py-2 text-sm text-zinc-200">
                      {formatDate(settings.gameStartDate)}
                    </p>
                  </div>

                  {/* Season Start Date */}
                  <div className="space-y-1.5">
                    <Label className="text-zinc-200">Season Start Date</Label>
                    <Select
                      value={
                        settings.seasonStartDate === '2026-03-06' ? 'early-march' :
                        settings.seasonStartDate === '2026-03-20' ? 'mid-march' :
                        settings.seasonStartDate === '2026-03-27' ? 'late-march' :
                        settings.seasonStartDate === '2026-04-03' ? 'april' :
                        'custom'
                      }
                      onValueChange={(val) => {
                        const dateMap: Record<string, string> = {
                          'early-march': '2026-03-06',
                          'mid-march': '2026-03-20',
                          'late-march': '2026-03-27',
                          'april': '2026-04-03',
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
                        <SelectItem value="mid-march">Mid March (Mar 20) - Default</SelectItem>
                        <SelectItem value="late-march">Late March (Mar 27)</SelectItem>
                        <SelectItem value="april">April (Apr 3)</SelectItem>
                        <SelectItem value="custom">Custom...</SelectItem>
                      </SelectContent>
                    </Select>
                    {![
                      '2026-03-06', '2026-03-20', '2026-03-27', '2026-04-03',
                    ].includes(settings.seasonStartDate) && (
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

                  {/* Finals Format */}
                  <FinalsFormatEditor
                    finals={settings.finals}
                    onChange={(finals) =>
                      setSettings((prev) => ({ ...prev, finals }))
                    }
                  />
                </CardContent>
              </Card>

              {/* Special Events & Exhibitions */}
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Special Events & Exhibitions</CardTitle>
                  <CardDescription>Optional exhibition matches that appear in the calendar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">Enable Special Events</Label>
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

                      {/* Origin Eligibility Rule */}
                      <div className="space-y-1.5 border-t border-zinc-800 pt-3">
                        <Label className="text-zinc-200">Origin Eligibility</Label>
                        <p className="text-xs text-zinc-500">
                          How players qualify for state-based representative teams (State of Origin, Preseason Showcase)
                        </p>
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
                        <p className="text-[10px] text-zinc-600">
                          {settings.specialEvents.originEligibility === 'birthplace'
                            ? 'Players represent the state they grew up in, reflecting underage talent pathways'
                            : settings.specialEvents.originEligibility === 'current-club'
                              ? 'Players represent the state of the AFL club they currently play for'
                              : 'Players represent the state league system their AFL club is affiliated with'}
                        </p>
                      </div>

                      {/* State of Origin Configuration */}
                      {settings.specialEvents.events['state-of-origin'] && (
                        <OriginConfigPanel
                          config={settings.specialEvents.originConfig ?? DEFAULT_ORIGIN_CONFIG}
                          onChange={(newConfig) =>
                            setSettings((prev) => ({
                              ...prev,
                              specialEvents: {
                                ...prev.specialEvents,
                                originConfig: newConfig,
                              },
                            }))
                          }
                        />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Advanced: Time Slots & Blockbusters */}
              <AdvancedSection>
                {/* Time Slots */}
                <MatchSlotGrid
                  slots={settings.fixtureSchedule.matchSlots}
                  onChange={(matchSlots) =>
                    setSettings((prev) => ({
                      ...prev,
                      fixtureSchedule: { ...prev.fixtureSchedule, matchSlots },
                    }))
                  }
                />

                {/* Blockbusters (only for real mode) */}
                {settings.leagueMode === 'real' && (
                  <BlockbusterEditor
                    blockbusters={settings.blockbusters}
                    onChange={(blockbusters) =>
                      setSettings((prev) => ({ ...prev, blockbusters }))
                    }
                  />
                )}
              </AdvancedSection>
            </div>
          )}

          {/* Step 5: Match & List Rules */}
          {currentStep === 5 && (
            <div className="mx-auto max-w-lg space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">Match & List Rules</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Configure scoring, squad sizes, and match rules
                </p>
              </div>

              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Scoring</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Points per goal */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="text-zinc-200">Points per Goal</Label>
                      <p className="text-xs text-zinc-500">Standard: 6</p>
                    </div>
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

                  {/* Points per behind */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="text-zinc-200">Points per Behind</Label>
                      <p className="text-xs text-zinc-500">Standard: 1</p>
                    </div>
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

                  {/* Interchange Players */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-zinc-200">Interchange Players</Label>
                        <p className="text-xs text-zinc-500">
                          Match day squad: {18 + settings.matchRules.interchangePlayers + (settings.matchRules.enableSubstitutes ? 1 : 0)}
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
                      min={0}
                      max={8}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-500">
                      <span>0 (18 on field only)</span>
                      <span>5 (2026 AFL)</span>
                      <span>8 (max)</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">Enable Match-Day Substitute</Label>
                      <p className="text-xs text-zinc-500">Adds one tactical substitute who can be activated in-game</p>
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
                </CardContent>
              </Card>

              {/* Advanced: Quarters, Possessions, Ladder Points, List Sizes */}
              <AdvancedSection>
                {/* Quarters per Match */}
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
                    <SelectTrigger className="w-full border-zinc-700 bg-zinc-800/50 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Halves</SelectItem>
                      <SelectItem value="3">3 Thirds</SelectItem>
                      <SelectItem value="4">4 Quarters (standard)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Possessions Multiplier */}
                <div className="space-y-3">
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
                    min={5}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>0.5x (Quick)</span>
                    <span>1.0x (AFL Average)</span>
                    <span>2.0x (Extended)</span>
                  </div>
                </div>

                {/* Ladder Points */}
                <div className="space-y-3">
                  <Label className="text-zinc-200">Ladder Points</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-zinc-500">Win</Label>
                      <Input
                        type="number"
                        value={settings.ladderPoints.pointsForWin}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            ladderPoints: {
                              ...prev.ladderPoints,
                              pointsForWin: parseInt(e.target.value, 10) || 0,
                            },
                          }))
                        }
                        className="border-zinc-600 bg-zinc-700/50 text-center text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500">Draw</Label>
                      <Input
                        type="number"
                        value={settings.ladderPoints.pointsForDraw}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            ladderPoints: {
                              ...prev.ladderPoints,
                              pointsForDraw: parseInt(e.target.value, 10) || 0,
                            },
                          }))
                        }
                        className="border-zinc-600 bg-zinc-700/50 text-center text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500">Loss</Label>
                      <Input
                        type="number"
                        value={settings.ladderPoints.pointsForLoss}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            ladderPoints: {
                              ...prev.ladderPoints,
                              pointsForLoss: parseInt(e.target.value, 10) || 0,
                            },
                          }))
                        }
                        className="border-zinc-600 bg-zinc-700/50 text-center text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* List Sizes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">Senior List Size</Label>
                      <p className="text-xs text-zinc-500">Standard: 38</p>
                    </div>
                    <span className="w-8 text-right text-sm font-bold tabular-nums text-zinc-200">
                      {settings.listRules.seniorListSize}
                    </span>
                  </div>
                  <Slider
                    value={[settings.listRules.seniorListSize]}
                    onValueChange={([val]) =>
                      setSettings((prev) => ({
                        ...prev,
                        listRules: { ...prev.listRules, seniorListSize: val },
                      }))
                    }
                    min={30}
                    max={46}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-200">Rookie List Size</Label>
                      <p className="text-xs text-zinc-500">Standard: 6</p>
                    </div>
                    <span className="w-8 text-right text-sm font-bold tabular-nums text-zinc-200">
                      {settings.listRules.rookieListSize}
                    </span>
                  </div>
                  <Slider
                    value={[settings.listRules.rookieListSize]}
                    onValueChange={([val]) =>
                      setSettings((prev) => ({
                        ...prev,
                        listRules: { ...prev.listRules, rookieListSize: val },
                      }))
                    }
                    min={2}
                    max={10}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Grand Final Venue */}
                <div className="space-y-2">
                  <Label className="text-zinc-200">Grand Final Venue</Label>
                  <div className="space-y-2">
                    {([
                      { value: 'fixed' as const, label: 'Fixed Venue', desc: 'Same venue every year' },
                      { value: 'random' as const, label: 'Random Rotation', desc: 'Random major venue each season' },
                      { value: 'top-club' as const, label: 'Home of Top Club', desc: 'Highest-finishing team hosts' },
                    ]).map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
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
                          <SelectItem key={venue} value={venue}>
                            {venue}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </AdvancedSection>
            </div>
          )}

          {/* Step 6: Gameplay Settings */}
          {currentStep === 6 && (
            <div className="mx-auto max-w-lg space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">Gameplay Settings</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Customize your gameplay experience
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetSettings}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Defaults
                </Button>
              </div>

              {/* Difficulty Presets */}
              <div className="grid grid-cols-3 gap-3">
                {DIFFICULTY_PRESETS.map((preset) => {
                  const isActive = settings.difficulty === preset.id
                  return (
                    <Card
                      key={preset.id}
                      className={cn(
                        'cursor-pointer border-2 transition-all duration-200',
                        isActive
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600',
                      )}
                      onClick={() => handleSelectPreset(preset.id)}
                    >
                      <CardContent className="p-4 text-center">
                        <p
                          className={cn(
                            'text-lg font-bold',
                            isActive ? 'text-blue-400' : 'text-zinc-200',
                          )}
                        >
                          {preset.label}
                        </p>
                        <p className="mt-1 text-xs leading-snug text-zinc-400">
                          {preset.description}
                        </p>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {settings.difficulty === 'custom' && (
                <p className="text-center text-xs text-zinc-500">
                  Custom settings &mdash; you've modified a preset value below.
                </p>
              )}

              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Rules</CardTitle>
                  <CardDescription>Toggle gameplay mechanics on or off.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Salary Cap */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-zinc-200">Salary Cap</Label>
                        <p className="text-xs text-zinc-500">
                          AFL 2026 salary cap: $18.3M
                        </p>
                      </div>
                      <Switch
                        checked={settings.salaryCap}
                        onCheckedChange={(val) =>
                          setSettings((prev) => ({ ...prev, salaryCap: val, difficulty: 'custom' }))
                        }
                      />
                    </div>
                    {settings.salaryCap && (
                      <div className="ml-0 space-y-1.5 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="salaryCapAmount" className="text-xs text-zinc-400">
                            Cap Amount
                          </Label>
                          <span className="text-sm font-bold text-zinc-200">
                            {formatCurrency(settings.salaryCapAmount)}
                          </span>
                        </div>
                        <Slider
                          value={[settings.salaryCapAmount]}
                          onValueChange={([val]) =>
                            setSettings((prev) => ({
                              ...prev,
                              salaryCapAmount: val,
                              difficulty: 'custom',
                            }))
                          }
                          min={10_000_000}
                          max={25_000_000}
                          step={100_000}
                          className="w-full"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-500">
                          <span>$10M</span>
                          <span>$18.3M (standard)</span>
                          <span>$25M</span>
                        </div>
                      </div>
                    )}
                  </div>

                </CardContent>
              </Card>

              <AffiliateManagementEditor
                clubs={clubs.map((club) => ({
                  id: club.id,
                  name: club.name,
                  abbreviation: club.abbreviation,
                }))}
                stateLeagues={previewStateLeagues}
                value={settings.stateLeagueAffiliations}
                onChange={(next) =>
                  setSettings((prev) => ({
                    ...prev,
                    stateLeagueAffiliations: next,
                  }))}
                title="State League Affiliate Management"
                description="Swap AFL club affiliate leagues before starting your save. Fixture and ladder structures are generated from these affiliations."
              />

              {/* Realism Settings */}
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader>
                  <CardTitle className="text-white">Realism</CardTitle>
                  <CardDescription>
                    Toggle AFL realism mechanics on or off.
                    {' '}
                    <span className="text-zinc-500">
                      {Object.values(settings.realism).filter(Boolean).length} of{' '}
                      {Object.keys(settings.realism).length} enabled
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Player Behavior */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Player Behavior</p>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Player Loyalty</Label>
                          <p className="text-xs text-zinc-500">Loyalty affects contract discounts & trade reluctance</p>
                        </div>
                        <Switch checked={settings.realism.playerLoyalty} onCheckedChange={(val) => updateRealism('playerLoyalty', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Trade Requests</Label>
                          <p className="text-xs text-zinc-500">Unhappy players nominate preferred clubs for trades</p>
                        </div>
                        <Switch checked={settings.realism.tradeRequests} onCheckedChange={(val) => updateRealism('tradeRequests', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Nominated Destinations</Label>
                          <p className="text-xs text-zinc-500">Trade-requesting players nominate destination clubs</p>
                        </div>
                        <Switch checked={settings.realism.nominatedTradeDestinations} onCheckedChange={(val) => updateRealism('nominatedTradeDestinations', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Reduced Nominated Leverage</Label>
                          <p className="text-xs text-zinc-500">When a player nominates a club, return can be discounted</p>
                        </div>
                        <Switch checked={settings.realism.reducedNominatedLeverage} onCheckedChange={(val) => updateRealism('reducedNominatedLeverage', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Players Refuse Trades</Label>
                          <p className="text-xs text-zinc-500">Players can refuse moves to clubs they do not want</p>
                        </div>
                        <Switch checked={settings.realism.playersRefuseTrades} onCheckedChange={(val) => updateRealism('playersRefuseTrades', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Player Role Disputes</Label>
                          <p className="text-xs text-zinc-500">Players lose morale when played out of position</p>
                        </div>
                        <Switch checked={settings.realism.playerRoleDisputes} onCheckedChange={(val) => updateRealism('playerRoleDisputes', val)} />
                      </div>
                    </div>
                  </div>

                  {/* Trading & Contracts */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Trading & Contracts</p>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Salary Dump Trades</Label>
                          <p className="text-xs text-zinc-500">Clubs offload big contracts with dead cap penalties</p>
                        </div>
                        <Switch checked={settings.realism.salaryDumpTrades} onCheckedChange={(val) => updateRealism('salaryDumpTrades', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Soft Cap Spending</Label>
                          <p className="text-xs text-zinc-500">Clubs can exceed salary cap with luxury tax</p>
                        </div>
                        <Switch checked={settings.realism.softCapSpending} onCheckedChange={(val) => updateRealism('softCapSpending', val)} />
                      </div>
                    </div>
                  </div>

                  {/* Draft & Development */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Draft & Development</p>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Draft Variance</Label>
                          <p className="text-xs text-zinc-500">Top picks can bust, late picks can bloom</p>
                        </div>
                        <Switch checked={settings.realism.draftVariance} onCheckedChange={(val) => updateRealism('draftVariance', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">NGA / Academy</Label>
                          <p className="text-xs text-zinc-500">Father-Son and Academy matching bid system</p>
                        </div>
                        <Switch checked={settings.realism.ngaAcademy} onCheckedChange={(val) => updateRealism('ngaAcademy', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Zone Matching Rules</Label>
                          <p className="text-xs text-zinc-500">Apply academy/NGA zone eligibility to matching bids</p>
                        </div>
                        <Switch checked={settings.realism.ngaAcademyZoneMatching} onCheckedChange={(val) => updateRealism('ngaAcademyZoneMatching', val)} />
                      </div>
                    </div>
                  </div>

                  {/* League Operations */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">League Operations</p>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Fixture Blockbuster Bias</Label>
                          <p className="text-xs text-zinc-500">Named matches get prime scheduling priority</p>
                        </div>
                        <Switch checked={settings.realism.fixtureBlockbusterBias} onCheckedChange={(val) => updateRealism('fixtureBlockbusterBias', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Rivalry Scheduling</Label>
                          <p className="text-xs text-zinc-500">Traditional rivals guaranteed to play twice per season</p>
                        </div>
                        <Switch checked={settings.realism.fixtureRivalryScheduling} onCheckedChange={(val) => updateRealism('fixtureRivalryScheduling', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Venue Scheduling</Label>
                          <p className="text-xs text-zinc-500">Shared venue allocation, sold games, dynamic home advantage</p>
                        </div>
                        <Switch checked={settings.realism.venueScheduling} onCheckedChange={(val) => updateRealism('venueScheduling', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Coaching Carousel</Label>
                          <p className="text-xs text-zinc-500">Poor-performing AI coaches get sacked</p>
                        </div>
                        <Switch checked={settings.realism.coachingCarousel} onCheckedChange={(val) => updateRealism('coachingCarousel', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Board Pressure</Label>
                          <p className="text-xs text-zinc-500">Board expectations affect your job security</p>
                        </div>
                        <Switch checked={settings.realism.boardPressure} onCheckedChange={(val) => updateRealism('boardPressure', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Board Politics</Label>
                          <p className="text-xs text-zinc-500">Internal factions can sway sackings and hiring outcomes</p>
                        </div>
                        <Switch checked={settings.realism.boardPolitics} onCheckedChange={(val) => updateRealism('boardPolitics', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">AFL House Interference</Label>
                          <p className="text-xs text-zinc-500">AFL mandates priority picks & scheduling for struggling clubs</p>
                        </div>
                        <Switch checked={settings.realism.aflHouseInterference} onCheckedChange={(val) => updateRealism('aflHouseInterference', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">AFL Expansion Evolution</Label>
                          <p className="text-xs text-zinc-500">AFL House may add new clubs slowly over time</p>
                        </div>
                        <Switch checked={settings.realism.aflHouseExpansionEvolution} onCheckedChange={(val) => updateRealism('aflHouseExpansionEvolution', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">AFL Competition Evolution</Label>
                          <p className="text-xs text-zinc-500">AFL House may switch competition models and trigger state/pathway restructures</p>
                        </div>
                        <Switch checked={settings.realism.aflHouseCompetitionEvolution} onCheckedChange={(val) => updateRealism('aflHouseCompetitionEvolution', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">AFL Finals Evolution</Label>
                          <p className="text-xs text-zinc-500">AFL House may change finals format between seasons</p>
                        </div>
                        <Switch checked={settings.realism.aflHouseFinalsEvolution} onCheckedChange={(val) => updateRealism('aflHouseFinalsEvolution', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">AFL List Rules Evolution</Label>
                          <p className="text-xs text-zinc-500">AFL House may adjust senior and rookie list limits</p>
                        </div>
                        <Switch checked={settings.realism.aflHouseListRulesEvolution} onCheckedChange={(val) => updateRealism('aflHouseListRulesEvolution', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">AFL Salary Cap Evolution</Label>
                          <p className="text-xs text-zinc-500">AFL House may revise salary cap settings year-to-year</p>
                        </div>
                        <Switch checked={settings.realism.aflHouseSalaryCapEvolution} onCheckedChange={(val) => updateRealism('aflHouseSalaryCapEvolution', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">AFL Fixture Evolution</Label>
                          <p className="text-xs text-zinc-500">AFL House may tweak fixture and season structure policy</p>
                        </div>
                        <Switch checked={settings.realism.aflHouseFixtureEvolution} onCheckedChange={(val) => updateRealism('aflHouseFixtureEvolution', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">List Size Enforcement</Label>
                          <p className="text-xs text-zinc-500">Enforce senior (38) and rookie (6) list limits</p>
                        </div>
                        <Switch checked={settings.realism.listSizeEnforcement} onCheckedChange={(val) => updateRealism('listSizeEnforcement', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Media Leaks</Label>
                          <p className="text-xs text-zinc-500">Player managers leak contract negotiations to the media</p>
                        </div>
                        <Switch checked={settings.realism.mediaLeaks} onCheckedChange={(val) => updateRealism('mediaLeaks', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Negotiation Delays</Label>
                          <p className="text-xs text-zinc-500">Multi-round negotiation delays (off = instant resolution)</p>
                        </div>
                        <Switch checked={settings.realism.negotiationDelays} onCheckedChange={(val) => updateRealism('negotiationDelays', val)} />
                      </div>
                    </div>
                  </div>

                  {/* Awards */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Awards & Events</p>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Brownlow Night</Label>
                          <p className="text-xs text-zinc-500">Votes hidden until the Brownlow ceremony before the Grand Final</p>
                        </div>
                        <Switch checked={settings.realism.brownlowNight} onCheckedChange={(val) => updateRealism('brownlowNight', val)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-zinc-200">Exhibition Match Impact</Label>
                          <p className="text-xs text-zinc-500">Special event matches affect player fatigue, injury risk, and form</p>
                        </div>
                        <Switch checked={settings.realism.specialEventPlayerImpact} onCheckedChange={(val) => updateRealism('specialEventPlayerImpact', val)} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Advanced: Injury, Dev Speed, Sim Speed */}
              <AdvancedSection>
                {/* Injury Frequency */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-200">Injury Frequency</Label>
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
                    <SelectTrigger className="w-full border-zinc-700 bg-zinc-800/50 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500">
                    How often players get injured during matches and training
                  </p>
                </div>

                {/* Development Speed */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-200">Development Speed</Label>
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
                    <SelectTrigger className="w-full border-zinc-700 bg-zinc-800/50 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slow">Slow</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="fast">Fast</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500">
                    How quickly young players improve their attributes
                  </p>
                </div>

                {/* Sim Speed */}
                <div className="space-y-1.5">
                  <Label className="text-zinc-200">Simulation Speed</Label>
                  <Select
                    value={settings.simSpeed}
                    onValueChange={(val) =>
                      setSettings((prev) => ({
                        ...prev,
                        simSpeed: val as GameSettings['simSpeed'],
                      }))
                    }
                  >
                    <SelectTrigger className="w-full border-zinc-700 bg-zinc-800/50 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instant">Instant</SelectItem>
                      <SelectItem value="fast">Fast</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500">
                    Speed of match simulations and transitions
                  </p>
                </div>
              </AdvancedSection>
            </div>
          )}

          {/* Step 7: Confirmation */}
          {currentStep === 7 && (
            <div className="mx-auto max-w-lg space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">Ready to Begin</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Review your career setup before starting
                </p>
              </div>

              {/* Manager Summary */}
              <SummaryCard title="Manager" onEdit={() => setCurrentStep(1)}>
                <SummaryRow label="Name" value={managerName.trim() || 'Not set'} />
                <SummaryRow label="Save Name" value={saveName} />
                <SummaryRow label="Career Start" value={startUnemployed ? 'Unemployed' : 'At Club'} />
              </SummaryCard>

              {/* Club Summary */}
              {selectedClubData && !startUnemployed && (
                <Card
                  className="border-2 bg-zinc-900/50"
                  style={{
                    borderColor: selectedClubData.colors.primary,
                    boxShadow: `0 0 30px ${selectedClubData.colors.primary}20`,
                  }}
                >
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-white">Club</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentStep(3)}
                      className="h-7 text-xs text-zinc-400 hover:text-white"
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div
                        className="h-14 w-14 shrink-0 rounded-full shadow-md"
                        style={{
                          background: `linear-gradient(135deg, ${selectedClubData.colors.primary} 50%, ${selectedClubData.colors.secondary} 50%)`,
                        }}
                      />
                      <div>
                        <p className="text-lg font-bold text-white">
                          {selectedClubData.fullName}
                        </p>
                        <p className="text-sm text-zinc-400">{selectedClubData.mascot}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                          <MapPin className="h-3 w-3" />
                          {selectedClubData.homeGround}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {startUnemployed && (
                <SummaryCard title="Club" onEdit={() => setCurrentStep(3)}>
                  <SummaryRow label="Status" value="Unemployed - entering coaching market" />
                </SummaryCard>
              )}

              {/* Season & Fixture Summary */}
              <SummaryCard title="Season & Fixture" onEdit={() => setCurrentStep(4)}>
                <SummaryRow
                  label="League Mode"
                  value={
                    settings.leagueMode === 'real'
                      ? 'Real AFL (18 teams)'
                      : settings.leagueMode === 'custom'
                        ? 'Custom Template'
                        : `Fictional (${settings.teamCount} teams)`
                  }
                />
                <SummaryRow
                  label="Naming Template"
                  value={settings.leagueNamingTemplate === 'real-life' ? 'Real-life-style' : 'Fictional'}
                />
                <SummaryRow
                  label="Pathway Leagues"
                  value={settings.includePathwayLeagues ? 'U16 + U18 enabled' : 'Disabled'}
                />
                <SummaryRow
                  label="Affiliations"
                  value={settings.stateLeagueAffiliations.allowCustomAffiliations
                    ? `${Object.keys(settings.stateLeagueAffiliations.clubAffiliations).length} custom overrides`
                    : 'Automatic'}
                />
                <SummaryRow
                  label="Regular Season"
                  value={`${settings.seasonStructure.regularSeasonRounds} rounds`}
                />
                <SummaryRow
                  label="Finals Format"
                  value={
                    FINALS_FORMATS.find((f) => f.id === settings.finals.finalsFormat)?.name ??
                    settings.finals.finalsFormat
                  }
                />
                <SummaryRow
                  label="Game Start"
                  value={`${OFFSEASON_STAGE_OPTIONS.find((o) => o.value === gameStartStage)?.label ?? 'Offseason'} (${formatDate(settings.gameStartDate)})`}
                />
                <SummaryRow
                  label="Blockbusters"
                  value={
                    settings.leagueMode === 'real'
                      ? `${settings.blockbusters.filter((b) => b.enabled).length} enabled`
                      : 'N/A'
                  }
                />
                <SummaryRow
                  label="Special Events"
                  value={
                    settings.specialEvents.enabled
                      ? `${Object.values(settings.specialEvents.events).filter(Boolean).length} of 5 enabled`
                      : 'Disabled'
                  }
                />
                {settings.specialEvents.enabled && settings.specialEvents.events['state-of-origin'] && settings.specialEvents.originConfig && (
                  <SummaryRow
                    label="State of Origin"
                    value={`${ORIGIN_FORMAT_LABELS[settings.specialEvents.originConfig.format]}, ${settings.specialEvents.originConfig.matchCount} matches — ${settings.specialEvents.originConfig.participatingStates.join(', ')}${settings.specialEvents.originConfig.alliesEnabled ? ' + ' + settings.specialEvents.originConfig.alliesName : ''}`}
                  />
                )}
              </SummaryCard>

              {/* Match Rules Summary */}
              <SummaryCard title="Match & List Rules" onEdit={() => setCurrentStep(5)}>
                <SummaryRow
                  label="Scoring"
                  value={`${settings.matchRules.pointsPerGoal} / ${settings.matchRules.pointsPerBehind} (goal / behind)`}
                />
                <SummaryRow
                  label="Interchange"
                  value={`${settings.matchRules.interchangePlayers}${settings.matchRules.enableSubstitutes ? ' + Sub' : ''} (squad of ${18 + settings.matchRules.interchangePlayers + (settings.matchRules.enableSubstitutes ? 1 : 0)})`}
                />
                <SummaryRow
                  label="Ladder Points"
                  value={`${settings.ladderPoints.pointsForWin}W / ${settings.ladderPoints.pointsForDraw}D / ${settings.ladderPoints.pointsForLoss}L`}
                />
                <SummaryRow
                  label="List Sizes"
                  value={`${settings.listRules.seniorListSize} senior + ${settings.listRules.rookieListSize} rookie`}
                />
              </SummaryCard>

              {/* Gameplay Summary */}
              <SummaryCard title="Gameplay" onEdit={() => setCurrentStep(6)}>
                <SummaryRow label="Difficulty" value={capitalize(settings.difficulty)} />
                <SummaryRow
                  label="Salary Cap"
                  value={
                    settings.salaryCap ? formatCurrency(settings.salaryCapAmount) : 'Off'
                  }
                />
                <SummaryRow
                  label="Realism"
                  value={`${Object.values(settings.realism).filter(Boolean).length} of ${Object.keys(settings.realism).length} enabled`}
                />
                <SummaryRow
                  label="Injuries"
                  value={capitalize(settings.injuryFrequency)}
                />
                <SummaryRow
                  label="Development"
                  value={capitalize(settings.developmentSpeed)}
                />
                <SummaryRow label="Sim Speed" value={capitalize(settings.simSpeed)} />
              </SummaryCard>

              {/* Start Game Button */}
              <Button
                size="lg"
                onClick={handleStartGame}
                className="w-full bg-emerald-600 py-6 text-lg font-bold text-white hover:bg-emerald-500"
              >
                <Play className="mr-2 h-5 w-5" />
                Start Game
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="sticky bottom-0 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>

          <span className="text-xs text-zinc-500">
            Step {currentStep} of {totalSteps}
          </span>

          {currentStep < totalSteps ? (
            <Button
              onClick={handleNext}
              disabled={!canAdvance(currentStep)}
              className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleStartGame}
              disabled={!selectedClub && !startUnemployed}
              className="bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-30"
            >
              <Play className="mr-1 h-4 w-4" />
              Start Game
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function SummaryCard({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white">{title}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-7 text-xs text-zinc-400 hover:text-white"
        >
          <Pencil className="mr-1 h-3 w-3" />
          Edit
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">{children}</div>
      </CardContent>
    </Card>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-200">{value}</span>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

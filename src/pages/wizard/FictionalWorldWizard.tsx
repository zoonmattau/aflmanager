import { useState } from 'react'
import type { Club } from '@/types/club'
import type { CustomLeagueTemplate, CustomFinalsRules } from '@/types/customLeague'
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
import { generateFictionalLeague } from '@/engine/league/leagueGenerator'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Globe2,
  Users,
  CalendarDays,
  Trophy,
  DollarSign,
  Zap,
  Network,
  Palette,
  ClipboardList,
  RotateCcw,
  Plus,
  Trash2,
  RefreshCw,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 'concept',     label: 'Concept',       icon: Globe2,        desc: 'League identity' },
  { id: 'competition', label: 'Competition',   icon: Users,         desc: 'Teams & structure' },
  { id: 'season',      label: 'Season',        icon: CalendarDays,  desc: 'Rounds & calendar' },
  { id: 'finals',      label: 'Finals',        icon: Trophy,        desc: 'Finals system' },
  { id: 'finance',     label: 'Finance',       icon: DollarSign,    desc: 'Salary & contracts' },
  { id: 'draft',       label: 'Draft & Dev',   icon: Zap,           desc: 'Player pathways' },
  { id: 'feeders',     label: 'Feeder Leagues',icon: Network,       desc: 'Development comps' },
  { id: 'teams',       label: 'Teams',         icon: Palette,       desc: 'Clubs & colours' },
  { id: 'review',      label: 'Review',        icon: ClipboardList, desc: 'Save & confirm' },
] as const

type StepId = typeof STEPS[number]['id']

// ---------------------------------------------------------------------------
// Wizard state
// ---------------------------------------------------------------------------

interface WizardDraft {
  // Concept
  leagueName: string
  namingTemplate: 'real-life' | 'fictional'
  // Competition
  teamCount: number
  competitionModel: 'single-table' | 'conferences' | 'divisions'
  conferenceCount: number
  divisionsPerConference: number
  enablePromotionRelegation: boolean
  promotionRelegationSpots: number
  // Season
  regularSeasonRounds: number
  byeRounds: boolean
  byeRoundCount: number
  // Finals
  finalsTeams: number
  finalsFormat: CustomFinalsRules['finalsFormat']
  // Finance
  salaryCap: boolean
  salaryCapAmount: number
  softCapSpending: boolean
  salaryDumpTrades: boolean
  mediaLeaks: boolean
  negotiationDelays: boolean
  // Draft & Dev
  draftVariance: boolean
  ngaAcademy: boolean
  developmentSpeed: 'slow' | 'normal' | 'fast'
  injuryFrequency: 'low' | 'medium' | 'high'
  // Feeders
  includePathwayLeagues: boolean
  // Teams
  clubs: Club[]
  selectedClubId: string | null
  // Review
  saveAsTemplate: boolean
  templateName: string
  templateDescription: string
}

function defaultDraft(initialClubs: Club[], teamCount: number): WizardDraft {
  const clubs = initialClubs.length > 0 ? initialClubs : generateFictionalLeague(teamCount, Date.now())
  return {
    leagueName: 'My League',
    namingTemplate: 'fictional',
    teamCount,
    competitionModel: 'single-table',
    conferenceCount: 2,
    divisionsPerConference: 2,
    enablePromotionRelegation: false,
    promotionRelegationSpots: 2,
    regularSeasonRounds: 22,
    byeRounds: true,
    byeRoundCount: 3,
    finalsTeams: 8,
    finalsFormat: 'afl-top-8',
    salaryCap: true,
    salaryCapAmount: 15_500_000,
    softCapSpending: true,
    salaryDumpTrades: true,
    mediaLeaks: true,
    negotiationDelays: false,
    draftVariance: true,
    ngaAcademy: false,
    developmentSpeed: 'normal',
    injuryFrequency: 'medium',
    includePathwayLeagues: true,
    clubs,
    selectedClubId: clubs[0]?.id ?? null,
    saveAsTemplate: true,
    templateName: 'My League',
    templateDescription: '',
  }
}

export interface WizardResult {
  clubs: Club[]
  teamCount: number
  leagueNamingTemplate: 'real-life' | 'fictional'
  regularSeasonRounds: number
  byeRounds: boolean
  byeRoundCount: number
  salaryCap: boolean
  salaryCapAmount: number
  realism: {
    softCapSpending: boolean
    salaryDumpTrades: boolean
    mediaLeaks: boolean
    negotiationDelays: boolean
    draftVariance: boolean
    ngaAcademy: boolean
  }
  developmentSpeed: 'slow' | 'normal' | 'fast'
  injuryFrequency: 'low' | 'medium' | 'high'
  includePathwayLeagues: boolean
}

function buildResult(d: WizardDraft): WizardResult {
  return {
    clubs: d.clubs,
    teamCount: d.clubs.length,
    leagueNamingTemplate: d.namingTemplate,
    regularSeasonRounds: d.regularSeasonRounds,
    byeRounds: d.byeRounds,
    byeRoundCount: d.byeRoundCount,
    salaryCap: d.salaryCap,
    salaryCapAmount: d.salaryCapAmount,
    realism: {
      softCapSpending: d.softCapSpending,
      salaryDumpTrades: d.salaryDumpTrades,
      mediaLeaks: d.mediaLeaks,
      negotiationDelays: d.negotiationDelays,
      draftVariance: d.draftVariance,
      ngaAcademy: d.ngaAcademy,
    },
    developmentSpeed: d.developmentSpeed,
    injuryFrequency: d.injuryFrequency,
    includePathwayLeagues: d.includePathwayLeagues,
  }
}

function buildTemplate(d: WizardDraft): CustomLeagueTemplate {
  const now = new Date().toISOString()
  return {
    id: `fictional-wizard-${Date.now()}`,
    name: d.templateName || d.leagueName,
    description: d.templateDescription,
    createdAt: now,
    lastModified: now,
    teams: d.clubs.map((c) => ({
      id: c.id,
      name: c.name,
      fullName: c.fullName,
      abbreviation: c.abbreviation,
      mascot: c.mascot,
      homeVenue: c.homeGround,
      established: c.established ?? 2000,
      colors: c.colors,
      tier: c.tier,
    })),
    rivalries: [],
    structure: {
      model: d.competitionModel,
      conferenceCount: d.conferenceCount,
      divisionsPerConference: d.divisionsPerConference,
      teamsPerDivision: Math.max(
        1,
        Math.floor(d.clubs.length / Math.max(1, d.conferenceCount * d.divisionsPerConference)),
      ),
      tierCount: 1,
      enablePromotionRelegation: d.enablePromotionRelegation,
      promotionRelegationSpots: d.promotionRelegationSpots,
    },
    ladderRules: {
      pointsForWin: 4,
      pointsForDraw: 2,
      pointsForLoss: 0,
      primarySort: 'points',
      tieBreakers: ['percentage'],
    },
    fixtureRules: {
      roundCount: d.regularSeasonRounds,
      byeRounds: d.byeRounds,
      byeRoundCount: d.byeRoundCount,
      enforceHomeAwayBalance: true,
      enforceRivalries: true,
      travelWeighting: 50,
      venueSharingRules: false,
    },
    finalsRules: {
      finalsTeams: d.finalsTeams,
      finalsFormat: d.finalsFormat,
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)

function colorSwatch(club: Club) {
  return `linear-gradient(135deg, ${club.colors.primary}, ${club.colors.secondary})`
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        {desc && <p className="text-xs text-zinc-500">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step content components
// ---------------------------------------------------------------------------

function StepConcept({ d, set }: { d: WizardDraft; set: (p: Partial<WizardDraft>) => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">What's your league called?</h2>
        <p className="mt-1 text-sm text-zinc-400">Give your fictional world an identity. You can change this later.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">League Name</Label>
        <Input
          value={d.leagueName}
          onChange={(e) => set({ leagueName: e.target.value, templateName: e.target.value })}
          placeholder="e.g. Northern Premier League"
          className="h-12 border-zinc-700 bg-zinc-800/60 text-lg text-white placeholder:text-zinc-600"
        />
      </div>

      <div className="space-y-3">
        <Label className="text-zinc-300">Naming Convention</Label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: 'fictional' as const, title: 'Fictional', desc: 'Made-up cities and mascots — fully invented world', example: 'Northbridge Hawks, Ironwood Panthers' },
            { id: 'real-life' as const, title: 'Real-life style', desc: 'Names that sound like real-world clubs', example: 'FC Newcastle, Athletic de Malvern' },
          ]).map((opt) => (
            <button
              key={opt.id}
              onClick={() => set({ namingTemplate: opt.id })}
              className={cn(
                'rounded-xl border-2 p-4 text-left transition-all',
                d.namingTemplate === opt.id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600',
              )}
            >
              <p className="font-semibold text-white">{opt.title}</p>
              <p className="mt-1 text-xs text-zinc-400">{opt.desc}</p>
              <p className="mt-2 font-mono text-[10px] text-zinc-600">{opt.example}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function StepCompetition({ d, set }: { d: WizardDraft; set: (p: Partial<WizardDraft>) => void }) {
  function handleTeamCountChange(count: number) {
    const clubs = generateFictionalLeague(count, Date.now())
    set({ teamCount: count, clubs, selectedClubId: clubs[0]?.id ?? null })
  }

  const totalGroups = d.competitionModel === 'single-table'
    ? 1
    : d.competitionModel === 'conferences'
      ? d.conferenceCount
      : d.conferenceCount * d.divisionsPerConference

  const teamsPerGroup = totalGroups > 0 ? Math.floor(d.teamCount / totalGroups) : d.teamCount

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Competition structure</h2>
        <p className="mt-1 text-sm text-zinc-400">How many teams and how are they organised?</p>
      </div>

      {/* Team count */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-zinc-300">Number of Teams</Label>
          <span className="text-2xl font-bold tabular-nums text-white">{d.teamCount}</span>
        </div>
        <Slider
          value={[d.teamCount]}
          onValueChange={([v]) => handleTeamCountChange(v % 2 === 0 ? v : v - 1)}
          min={4} max={32} step={2}
        />
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>4</span><span>16 (standard)</span><span>32</span>
        </div>
        <p className="text-[11px] text-amber-400/70">Changing team count regenerates all clubs.</p>
      </div>

      {/* Model */}
      <div className="space-y-3">
        <Label className="text-zinc-300">Competition Model</Label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'single-table' as const, label: 'Single Table', desc: 'Everyone in one ladder' },
            { id: 'conferences' as const, label: 'Conferences', desc: 'Two or more conferences' },
            { id: 'divisions' as const, label: 'Divisions', desc: 'Conferences with divisions' },
          ]).map((m) => (
            <button
              key={m.id}
              onClick={() => set({ competitionModel: m.id })}
              className={cn(
                'rounded-lg border p-3 text-left text-xs transition-all',
                d.competitionModel === m.id
                  ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
              )}
            >
              <p className="font-semibold">{m.label}</p>
              <p className="mt-0.5 text-zinc-500">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Conference/division config */}
      {d.competitionModel !== 'single-table' && (
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-300">Conferences</Label>
              <span className="font-bold tabular-nums text-white">{d.conferenceCount}</span>
            </div>
            <Slider value={[d.conferenceCount]} onValueChange={([v]) => set({ conferenceCount: v })} min={2} max={6} step={1} />
          </div>
          {d.competitionModel === 'divisions' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-zinc-300">Divisions per Conference</Label>
                <span className="font-bold tabular-nums text-white">{d.divisionsPerConference}</span>
              </div>
              <Slider value={[d.divisionsPerConference]} onValueChange={([v]) => set({ divisionsPerConference: v })} min={1} max={4} step={1} />
            </div>
          )}
          <p className="text-xs text-zinc-500">
            {totalGroups} group{totalGroups !== 1 ? 's' : ''} · ~{teamsPerGroup} team{teamsPerGroup !== 1 ? 's' : ''} each
          </p>
        </div>
      )}

      {/* Promotion/relegation */}
      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <Toggle
          label="Promotion & Relegation"
          desc="Bottom clubs drop down to a second tier"
          checked={d.enablePromotionRelegation}
          onChange={(v) => set({ enablePromotionRelegation: v })}
        />
        {d.enablePromotionRelegation && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-400">Spots per season</Label>
              <span className="font-bold text-zinc-200">{d.promotionRelegationSpots}</span>
            </div>
            <Slider value={[d.promotionRelegationSpots]} onValueChange={([v]) => set({ promotionRelegationSpots: v })} min={1} max={4} step={1} />
          </div>
        )}
      </div>
    </div>
  )
}

function StepSeason({ d, set }: { d: WizardDraft; set: (p: Partial<WizardDraft>) => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Season format</h2>
        <p className="mt-1 text-sm text-zinc-400">How long is your home-and-away season?</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-zinc-300">Regular Season Rounds</Label>
          <span className="text-2xl font-bold tabular-nums text-white">{d.regularSeasonRounds}</span>
        </div>
        <Slider value={[d.regularSeasonRounds]} onValueChange={([v]) => set({ regularSeasonRounds: v })} min={0} max={40} step={1} />
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>0 (finals only)</span><span>22 (standard)</span><span>40</span>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <Toggle
          label="Bye Rounds"
          desc="Rest weeks scheduled mid-season"
          checked={d.byeRounds}
          onChange={(v) => set({ byeRounds: v })}
        />
        {d.byeRounds && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-400">Number of bye rounds</Label>
              <span className="font-bold text-zinc-200">{d.byeRoundCount}</span>
            </div>
            <Slider value={[d.byeRoundCount]} onValueChange={([v]) => set({ byeRoundCount: v })} min={1} max={6} step={1} />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-xs text-zinc-500">
          Total rounds: <span className="font-bold text-zinc-300">{d.regularSeasonRounds + (d.byeRounds ? d.byeRoundCount : 0)}</span>
          {' '}(regular season + finals)
        </p>
      </div>
    </div>
  )
}

const FINALS_PRESETS: Array<{
  id: CustomFinalsRules['finalsFormat']
  label: string
  teams: number
  weeks: number
  desc: string
  diagram: string
}> = [
  { id: 'page-mcintyre-top-4', label: 'Top 4', teams: 4, weeks: 3, desc: 'Double-chance for top 2 via Page-McIntyre system', diagram: '1v2 · 3v4 → GF' },
  { id: 'top-6', label: 'Top 6', teams: 6, weeks: 3, desc: 'Six teams, elimination from first round for bottom two', diagram: '1v2 · 3v6 · 4v5' },
  { id: 'afl-top-8', label: 'Top 8', teams: 8, weeks: 4, desc: 'AFL-style: double chance for top 4, elimination for 5–8', diagram: 'QF → SF → PF → GF' },
  { id: 'afl-top-10', label: 'Top 10', teams: 10, weeks: 4, desc: 'Extra qualifying round before the standard top-8 bracket', diagram: 'Play-in → QF → SF → PF → GF' },
  { id: 'straight-knockout', label: 'Knockout', teams: Math.pow(2, Math.ceil(Math.log2(8))), weeks: 3, desc: 'Single-elimination bracket — no second chances', diagram: '1v8 · 2v7 · 3v6 · 4v5' },
  { id: 'round-robin', label: 'Round Robin', teams: 4, weeks: 3, desc: 'Top 4 play each other once; best record wins the flag', diagram: 'All play all' },
]

function StepFinals({ d, set }: { d: WizardDraft; set: (p: Partial<WizardDraft>) => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Finals system</h2>
        <p className="mt-1 text-sm text-zinc-400">How does your league decide its champion?</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FINALS_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => set({ finalsFormat: preset.id, finalsTeams: preset.teams })}
            className={cn(
              'rounded-xl border-2 p-4 text-left transition-all',
              d.finalsFormat === preset.id
                ? 'border-amber-500 bg-amber-500/10'
                : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-800/50',
            )}
          >
            <div className="flex items-start justify-between">
              <p className={cn('text-lg font-bold', d.finalsFormat === preset.id ? 'text-amber-300' : 'text-white')}>
                {preset.label}
              </p>
              {d.finalsFormat === preset.id && <Check className="h-4 w-4 text-amber-400" />}
            </div>
            <p className="mt-1 text-xs text-zinc-400">{preset.desc}</p>
            <p className="mt-2 font-mono text-[10px] text-zinc-600">{preset.diagram}</p>
            <div className="mt-2 flex gap-3 text-[10px] text-zinc-500">
              <span>{preset.teams} teams</span>
              <span>{preset.weeks} wks</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function StepFinance({ d, set }: { d: WizardDraft; set: (p: Partial<WizardDraft>) => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Finance &amp; contracts</h2>
        <p className="mt-1 text-sm text-zinc-400">Set the financial rules that govern your league.</p>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <Toggle label="Salary Cap" desc="Hard cap on total player spending" checked={d.salaryCap} onChange={(v) => set({ salaryCap: v })} />
        {d.salaryCap && (
          <div className="space-y-2 border-t border-zinc-800 pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-400">Cap Amount</Label>
              <span className="font-bold text-zinc-200">{formatCurrency(d.salaryCapAmount)}</span>
            </div>
            <Slider
              value={[d.salaryCapAmount]}
              onValueChange={([v]) => set({ salaryCapAmount: v })}
              min={10_000_000} max={25_000_000} step={500_000}
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>$10M</span><span>$15.5M (AFL)</span><span>$25M</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Contract Rules</p>
        <Toggle label="Soft Cap / Luxury Tax" desc="Clubs can exceed cap with financial penalty" checked={d.softCapSpending} onChange={(v) => set({ softCapSpending: v })} />
        <Toggle label="Salary Dump Trades" desc="Clubs can offload contracts with dead cap penalties" checked={d.salaryDumpTrades} onChange={(v) => set({ salaryDumpTrades: v })} />
        <Toggle label="Media Leaks" desc="Player managers leak negotiations to the press" checked={d.mediaLeaks} onChange={(v) => set({ mediaLeaks: v })} />
        <Toggle label="Negotiation Delays" desc="Multi-round delays in contract talks (off = instant)" checked={d.negotiationDelays} onChange={(v) => set({ negotiationDelays: v })} />
      </div>
    </div>
  )
}

function StepDraft({ d, set }: { d: WizardDraft; set: (p: Partial<WizardDraft>) => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Draft &amp; development</h2>
        <p className="mt-1 text-sm text-zinc-400">How do young players enter your league and grow?</p>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Draft Rules</p>
        <Toggle label="Draft Variance" desc="Top picks can bust; late picks can bloom into stars" checked={d.draftVariance} onChange={(v) => set({ draftVariance: v })} />
        <Toggle label="Academy / Pathway System" desc="Clubs can match bids for players in their zone" checked={d.ngaAcademy} onChange={(v) => set({ ngaAcademy: v })} />
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Simulation Rates</p>
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Player Development Speed</Label>
          <Select value={d.developmentSpeed} onValueChange={(v) => set({ developmentSpeed: v as WizardDraft['developmentSpeed'] })}>
            <SelectTrigger className="border-zinc-700 bg-zinc-800/50 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="slow">Slow — careers take longer to peak</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="fast">Fast — players peak and decline quickly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Injury Frequency</Label>
          <Select value={d.injuryFrequency} onValueChange={(v) => set({ injuryFrequency: v as WizardDraft['injuryFrequency'] })}>
            <SelectTrigger className="border-zinc-700 bg-zinc-800/50 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low — injuries are rare</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High — squad depth is critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

function StepFeeders({ d, set }: { d: WizardDraft; set: (p: Partial<WizardDraft>) => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Feeder leagues</h2>
        <p className="mt-1 text-sm text-zinc-400">Configure development competitions that run alongside your main league.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <Toggle
          label="State / Regional Leagues"
          desc="Second-tier clubs affiliated with your main league clubs compete in separate competitions"
          checked
          onChange={() => {}}
        />
        <p className="text-xs text-zinc-600">Always enabled — state leagues are auto-generated from your club list.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <Toggle
          label="U18 &amp; U16 Pathway Competitions"
          desc="Underage competitions feed prospects into the draft each year"
          checked={d.includePathwayLeagues}
          onChange={(v) => set({ includePathwayLeagues: v })}
        />
        {d.includePathwayLeagues && (
          <p className="text-xs text-zinc-500 border-t border-zinc-800 pt-3">
            Two pathway competitions will be simulated each season: an under-18 national competition and an under-16 state series. Draft prospects are seeded from these leagues.
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Teams step — full two-panel editor
// ---------------------------------------------------------------------------

function StepTeams({ d, set }: { d: WizardDraft; set: (p: Partial<WizardDraft>) => void }) {
  const selected = d.clubs.find((c) => c.id === d.selectedClubId) ?? null

  function updateClub(id: string, patch: Partial<Club>) {
    set({ clubs: d.clubs.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  }

  function handleRegenAll() {
    const clubs = generateFictionalLeague(d.clubs.length, Date.now())
    set({ clubs, selectedClubId: clubs[0]?.id ?? null })
  }

  function handleRegenOne(id: string) {
    const idx = d.clubs.findIndex((c) => c.id === id)
    const fresh = generateFictionalLeague(1, Date.now() + idx * 7919)[0]
    set({ clubs: d.clubs.map((c) => (c.id === id ? { ...fresh, id } : c)) })
  }

  function handleAdd() {
    const fresh = generateFictionalLeague(1, Date.now() + d.clubs.length * 3571)[0]
    const id = `fictional-custom-${Date.now()}`
    const club: Club = { ...fresh, id }
    set({ clubs: [...d.clubs, club], selectedClubId: id })
  }

  function handleDelete(id: string) {
    if (d.clubs.length <= 2) return
    const next = d.clubs.filter((c) => c.id !== id)
    set({ clubs: next, selectedClubId: d.selectedClubId === id ? (next[0]?.id ?? null) : d.selectedClubId })
  }

  const tierCounts = d.clubs.reduce(
    (acc, c) => { acc[c.tier ?? 'medium']++; return acc },
    { large: 0, medium: 0, small: 0 } as Record<string, number>,
  )

  return (
    <div className="flex h-full min-h-0 gap-0">
      {/* Team list */}
      <div className="flex w-52 shrink-0 flex-col border-r border-zinc-800">
        <div className="shrink-0 flex items-center justify-between border-b border-zinc-800 px-3 py-2">
          <span className="text-xs text-zinc-500">{d.clubs.length} clubs</span>
          <button onClick={handleRegenAll} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
            <RotateCcw className="h-3 w-3" /> Regen all
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {d.clubs.map((club) => (
            <button
              key={club.id}
              onClick={() => set({ selectedClubId: club.id })}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                d.selectedClubId === club.id ? 'bg-zinc-800' : 'hover:bg-zinc-900',
              )}
            >
              <div className="h-5 w-5 shrink-0 rounded-full shadow-sm" style={{ background: colorSwatch(club) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-200">{club.name}</p>
                <p className="text-[10px] text-zinc-500">{club.abbreviation}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="shrink-0 border-t border-zinc-800 p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs text-zinc-500 hover:text-zinc-300" onClick={handleAdd}>
            <Plus className="h-3.5 w-3.5" /> Add Team
          </Button>
        </div>
      </div>

      {/* Editor */}
      {selected ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Editor header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full shadow-lg" style={{ background: colorSwatch(selected) }} />
              <div>
                <p className="text-lg font-bold text-white">{selected.fullName}</p>
                <p className="text-xs text-zinc-500">{selected.homeGround}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-500 hover:text-zinc-300" onClick={() => handleRegenOne(selected.id)}>
                <RefreshCw className="mr-1 h-3 w-3" /> Randomise
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500/60 hover:text-red-400" onClick={() => handleDelete(selected.id)} disabled={d.clubs.length <= 2}>
                <Trash2 className="mr-1 h-3 w-3" /> Remove
              </Button>
            </div>
          </div>

          {/* Identity */}
          <section className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Identity</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">City / Name</Label>
                <Input value={selected.name} onChange={(e) => updateClub(selected.id, { name: e.target.value, fullName: `${e.target.value} ${selected.mascot}` })} className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Mascot</Label>
                <Input value={selected.mascot} onChange={(e) => updateClub(selected.id, { mascot: e.target.value, fullName: `${selected.name} ${e.target.value}` })} className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Abbreviation</Label>
                <Input value={selected.abbreviation} maxLength={4} onChange={(e) => updateClub(selected.id, { abbreviation: e.target.value.toUpperCase().slice(0, 4) })} className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Established</Label>
                <Input type="number" value={selected.established ?? 2000} onChange={(e) => updateClub(selected.id, { established: parseInt(e.target.value, 10) || 2000 })} className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs text-zinc-400">Home Ground / Stadium</Label>
                <Input value={selected.homeGround} onChange={(e) => updateClub(selected.id, { homeGround: e.target.value })} className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white" />
              </div>
            </div>
          </section>

          {/* Colours */}
          <section className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Colours</p>
            <div className="flex items-end gap-5">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Primary</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={selected.colors.primary} onChange={(e) => updateClub(selected.id, { colors: { ...selected.colors, primary: e.target.value } })} className="h-9 w-14 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0.5" />
                  <span className="font-mono text-xs text-zinc-500">{selected.colors.primary}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Secondary</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={selected.colors.secondary} onChange={(e) => updateClub(selected.id, { colors: { ...selected.colors, secondary: e.target.value } })} className="h-9 w-14 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0.5" />
                  <span className="font-mono text-xs text-zinc-500">{selected.colors.secondary}</span>
                </div>
              </div>
              <div className="ml-auto h-16 w-32 rounded-xl shadow-lg" style={{ background: colorSwatch(selected) }} />
            </div>
          </section>

          {/* Club profile */}
          <section className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Club Profile</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Market Tier</Label>
                <Select value={selected.tier ?? 'medium'} onValueChange={(v) => updateClub(selected.id, { tier: v as Club['tier'] })}>
                  <SelectTrigger className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="large">Large market</SelectItem>
                    <SelectItem value="medium">Medium market</SelectItem>
                    <SelectItem value="small">Small market</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-400">Premierships</Label>
                  <span className="text-xs font-bold text-zinc-300">{selected.premierships ?? 0}</span>
                </div>
                <Slider value={[selected.premierships ?? 0]} min={0} max={20} step={1} onValueChange={([v]) => updateClub(selected.id, { premierships: v })} />
              </div>
            </div>
          </section>

          {/* Tier summary */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
            <p className="mb-2 text-[10px] text-zinc-500">League tier distribution</p>
            <div className="flex gap-4 text-xs">
              {(['large', 'medium', 'small'] as const).map((t) => (
                <span key={t} className="capitalize text-zinc-400">{t}: <strong className="text-zinc-200">{tierCounts[t]}</strong></span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">Select a club to edit</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Review step
// ---------------------------------------------------------------------------

function StepReview({ d, set }: { d: WizardDraft; set: (p: Partial<WizardDraft>) => void }) {
  const rows: Array<[string, string]> = [
    ['League Name', d.leagueName],
    ['Naming Convention', d.namingTemplate === 'fictional' ? 'Fictional' : 'Real-life style'],
    ['Teams', `${d.clubs.length}`],
    ['Structure', d.competitionModel === 'single-table' ? 'Single table' : d.competitionModel === 'conferences' ? `${d.conferenceCount} conferences` : `${d.conferenceCount}×${d.divisionsPerConference} divisions`],
    ['Promotion / Relegation', d.enablePromotionRelegation ? `${d.promotionRelegationSpots} spots` : 'Off'],
    ['Regular Season Rounds', `${d.regularSeasonRounds}`],
    ['Bye Rounds', d.byeRounds ? `${d.byeRoundCount}` : 'None'],
    ['Finals', FINALS_PRESETS.find((f) => f.id === d.finalsFormat)?.label ?? d.finalsFormat],
    ['Salary Cap', d.salaryCap ? formatCurrency(d.salaryCapAmount) : 'Off'],
    ['Soft Cap', d.softCapSpending ? 'On' : 'Off'],
    ['Draft Variance', d.draftVariance ? 'On' : 'Off'],
    ['Academy System', d.ngaAcademy ? 'On' : 'Off'],
    ['Development Speed', d.developmentSpeed],
    ['Injury Frequency', d.injuryFrequency],
    ['Pathway Leagues', d.includePathwayLeagues ? 'On' : 'Off'],
  ]

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Review &amp; confirm</h2>
        <p className="mt-1 text-sm text-zinc-400">Everything looks good? You can adjust settings after starting too.</p>
      </div>

      {/* Summary table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
        {rows.map(([label, val], i) => (
          <div key={label} className={cn('flex items-center justify-between px-4 py-2.5 text-sm', i % 2 === 0 ? 'bg-zinc-900/40' : '')}>
            <span className="text-zinc-400">{label}</span>
            <span className="font-medium text-zinc-200">{val}</span>
          </div>
        ))}
      </div>

      {/* Clubs strip */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500">{d.clubs.length} clubs</p>
        <div className="flex flex-wrap gap-1.5">
          {d.clubs.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.colors.primary }} />
              {c.abbreviation}
            </span>
          ))}
        </div>
      </div>

      {/* Save as template */}
      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <Toggle
          label="Save as League Template"
          desc="Store this setup so you can reuse it in future careers"
          checked={d.saveAsTemplate}
          onChange={(v) => set({ saveAsTemplate: v })}
        />
        {d.saveAsTemplate && (
          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Template Name</Label>
              <Input
                value={d.templateName}
                onChange={(e) => set({ templateName: e.target.value })}
                placeholder={d.leagueName}
                className="h-8 border-zinc-700 bg-zinc-800/50 text-sm text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Description <span className="text-zinc-600">(optional)</span></Label>
              <textarea
                value={d.templateDescription}
                onChange={(e) => set({ templateDescription: e.target.value })}
                rows={2}
                placeholder="Brief description of your league..."
                className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

interface FictionalWorldWizardProps {
  onConfirm: (result: WizardResult) => void
  onCancel: () => void
  initialClubs: Club[]
  initialTeamCount: number
}

export function FictionalWorldWizard({ onConfirm, onCancel, initialClubs, initialTeamCount }: FictionalWorldWizardProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const [draft, setDraftRaw] = useState<WizardDraft>(() => defaultDraft(initialClubs, initialTeamCount))
  const createOrUpdateTemplate = useAppStore((s) => s.createOrUpdateCustomLeagueTemplate)

  const step = STEPS[stepIdx]
  const isFirst = stepIdx === 0
  const isLast = stepIdx === STEPS.length - 1

  function set(patch: Partial<WizardDraft>) {
    setDraftRaw((prev) => ({ ...prev, ...patch }))
  }

  async function handleFinish() {
    if (draft.saveAsTemplate) {
      await createOrUpdateTemplate(buildTemplate(draft))
    }
    onConfirm(buildResult(draft))
  }

  const stepProps = { d: draft, set }

  const stepContent: Record<StepId, React.ReactNode> = {
    concept: <StepConcept {...stepProps} />,
    competition: <StepCompetition {...stepProps} />,
    season: <StepSeason {...stepProps} />,
    finals: <StepFinals {...stepProps} />,
    finance: <StepFinance {...stepProps} />,
    draft: <StepDraft {...stepProps} />,
    feeders: <StepFeeders {...stepProps} />,
    teams: <StepTeams {...stepProps} />,
    review: <StepReview {...stepProps} />,
  }

  const isTeamsStep = step.id === 'teams'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-6 py-3">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Cancel
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-200">{draft.leagueName || 'New League'}</p>
          <p className="text-xs text-zinc-500">Step {stepIdx + 1} of {STEPS.length} — {step.label}</p>
        </div>
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => i < stepIdx && setStepIdx(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === stepIdx ? 'w-6 bg-blue-500' : i < stepIdx ? 'w-3 bg-zinc-500 hover:bg-zinc-400 cursor-pointer' : 'w-3 bg-zinc-800 cursor-default',
              )}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="hidden w-56 shrink-0 flex-col border-r border-zinc-800 py-4 lg:flex">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = i < stepIdx
            const active = i === stepIdx
            return (
              <button
                key={s.id}
                onClick={() => i <= stepIdx && setStepIdx(i)}
                className={cn(
                  'flex items-center gap-3 px-5 py-3 text-left text-sm transition-colors',
                  active ? 'bg-zinc-800 text-white' : done ? 'cursor-pointer text-zinc-400 hover:bg-zinc-900 hover:text-zinc-300' : 'cursor-default text-zinc-700',
                )}
              >
                <div className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                  active ? 'border-blue-500 bg-blue-500/20 text-blue-300' : done ? 'border-zinc-600 bg-zinc-700 text-zinc-300' : 'border-zinc-800 text-zinc-700',
                )}>
                  {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{s.label}</p>
                  <p className={cn('truncate text-[10px]', active ? 'text-zinc-400' : 'text-zinc-600')}>{s.desc}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className={cn('flex-1 overflow-hidden', isTeamsStep ? 'flex flex-col' : 'overflow-y-auto')}>
          <div className={cn('w-full', isTeamsStep ? 'flex h-full flex-col' : 'px-8 py-10')}>
            {isTeamsStep ? (
              <div className="flex h-full flex-col">
                <div className="shrink-0 border-b border-zinc-800 px-8 py-4">
                  <h2 className="text-xl font-bold text-white">Teams</h2>
                  <p className="text-sm text-zinc-400">Edit each club's name, colours and home ground.</p>
                </div>
                <div className="min-h-0 flex-1">
                  {stepContent['teams']}
                </div>
              </div>
            ) : (
              stepContent[step.id]
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-6 py-4">
        <Button
          variant="ghost"
          className="text-zinc-400 hover:text-white"
          onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          disabled={isFirst}
        >
          <ChevronLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>

        <div className="flex items-center gap-2 text-xs text-zinc-600">
          {step.id === 'teams' && (
            <span>{draft.clubs.length} clubs · click a club to edit</span>
          )}
        </div>

        {isLast ? (
          <Button className="bg-emerald-600 px-6 text-white hover:bg-emerald-500" onClick={handleFinish}>
            <Check className="mr-2 h-4 w-4" />
            Start with {draft.clubs.length} Teams
          </Button>
        ) : (
          <Button
            className="bg-blue-600 px-6 text-white hover:bg-blue-500"
            onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
          >
            Next
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Link } from 'react-router-dom'
import type { DraftProspect, DraftPick, ScoutingRegion } from '@/types/draft'
import type { PlayerPositionType } from '@/types/player'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getProspectOverall } from '@/engine/draft/prospects'
import type { DraftPickTradeOffer } from '@/types/draft'
import type { SuggestNextPickResult, DelegatedPickRecord, DraftSuggestionRationale } from '@/engine/draft/draftEngine'
import { ALL_POSITION_TYPES } from '@/engine/core/constants'
import {
  getProspectEligiblePositionTypes,
  getPlayerEligiblePositionTypes,
  isProspectEligibleForPositionType,
} from '@/engine/player/positionEligibility'
import { useTableViewManager, type TableViewColumnConfig } from '@/components/table-view/useTableViewManager'
import { TableViewManagerControl } from '@/components/table-view/TableViewManagerControl'
import { ShortlistAssignMenu, ShortlistManager } from '@/components/shortlists/ShortlistManager'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<DraftProspect['tier'], string> = {
  elite: 'bg-green-600 text-white',
  'first-round': 'bg-blue-600 text-white',
  'second-round': 'bg-yellow-500 text-black',
  late: 'bg-orange-500 text-white',
  'rookie-list': 'bg-gray-500 text-white',
}

const TIER_LABELS: Record<DraftProspect['tier'], string> = {
  elite: 'Elite',
  'first-round': '1st Round',
  'second-round': '2nd Round',
  late: 'Late',
  'rookie-list': 'Rookie',
}

const ALL_REGIONS: ScoutingRegion[] = [
  'VIC', 'SA', 'WA', 'NSW/ACT', 'QLD', 'TAS', 'NT',
]

const ALL_TIERS: DraftProspect['tier'][] = [
  'elite', 'first-round', 'second-round', 'late', 'rookie-list',
]

type ProspectSortField =
  | 'projectedPick'
  | 'name'
  | 'position'
  | 'age'
  | 'height'
  | 'weight'
  | 'region'
  | 'tier'
  | 'overall'

const IDEAL_POSITIONAL_COUNTS: Record<PlayerPositionType, number> = {
  BP: 3,
  FB: 3,
  HBF: 4,
  CHB: 3,
  W: 3,
  IM: 6,
  OM: 5,
  RK: 3,
  HFF: 4,
  CHF: 3,
  FP: 3,
  FF: 3,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoutedOverall(
  prospect: DraftProspect,
  clubId: string,
): string {
  const report = prospect.scoutingReports[clubId]
  if (!report) return '?'
  return String(report.overallEstimate)
}

function getScoutedRange(
  prospect: DraftProspect,
  clubId: string,
): string {
  const report = prospect.scoutingReports[clubId]
  if (!report) return '?'

  const ranges = Object.values(report.attributeRanges)
  if (ranges.length === 0) return String(report.overallEstimate)

  // Show overall estimate plus a +/- range based on confidence
  const avgLow = Math.round(
    ranges.reduce((sum, r) => sum + r[0], 0) / ranges.length,
  )
  const avgHigh = Math.round(
    ranges.reduce((sum, r) => sum + r[1], 0) / ranges.length,
  )
  return `${avgLow}-${avgHigh}`
}

function getScoutedPotentialRange(
  prospect: DraftProspect,
  clubId: string,
): string {
  const report = prospect.scoutingReports[clubId]
  if (!report || !report.potentialRange) return '?'
  return `${Math.round(report.potentialRange[0])}-${Math.round(report.potentialRange[1])}`
}

function tierSortOrder(tier: DraftProspect['tier']): number {
  const order: Record<DraftProspect['tier'], number> = {
    elite: 0,
    'first-round': 1,
    'second-round': 2,
    late: 3,
    'rookie-list': 4,
  }
  return order[tier]
}

function rankProspectForUser(prospect: DraftProspect, clubId: string): number {
  const report = prospect.scoutingReports[clubId]
  if (report) {
    const confidenceBonus = report.confidence * 4
    return report.overallEstimate * 0.7 + report.potentialEstimate * 0.3 + confidenceBonus
  }
  return getProspectOverall(prospect) * 0.75 + (80 - prospect.projectedPick) * 0.25
}

function deriveTeamNeeds(players: Record<string, import('@/types/player').Player>, clubId: string): PlayerPositionType[] {
  const counts = {} as Record<PlayerPositionType, number>
  for (const p of Object.values(players)) {
    if (p.clubId !== clubId) continue
    const eligiblePositions = getPlayerEligiblePositionTypes(p)
    for (const pos of eligiblePositions) {
      const weight = pos === p.position.primary ? 1 : 0.5
      counts[pos] = (counts[pos] ?? 0) + weight
    }
  }
  const needs = (Object.keys(IDEAL_POSITIONAL_COUNTS) as PlayerPositionType[])
    .map((pos) => ({ pos, deficit: (IDEAL_POSITIONAL_COUNTS[pos] ?? 0) - (counts[pos] ?? 0) }))
    .filter((x) => x.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit)
    .map((x) => x.pos)
  return needs
}

const RATIONALE_LABELS: Record<DraftSuggestionRationale, string> = {
  'best-available': 'Best Available',
  'team-need': 'Team Need',
  upside: 'Upside',
  character: 'Character',
  'local-talent': 'Local Talent',
  'father-son': 'Father-Son / Academy',
}

const RATIONALE_COLORS: Record<DraftSuggestionRationale, string> = {
  'best-available': 'bg-blue-600 text-white',
  'team-need': 'bg-green-600 text-white',
  upside: 'bg-purple-600 text-white',
  character: 'bg-cyan-600 text-white',
  'local-talent': 'bg-amber-500 text-black',
  'father-son': 'bg-pink-600 text-white',
}

// ---------------------------------------------------------------------------
// Staff Suggestion Card
// ---------------------------------------------------------------------------

function StaffSuggestionCard({
  suggestion,
  prospects,
  playerClubId,
  onAccept,
  onDismiss,
}: {
  suggestion: SuggestNextPickResult
  prospects: DraftProspect[]
  playerClubId: string
  onAccept: (prospectId: string) => void
  onDismiss: () => void
}) {
  const rec = suggestion.recommendation
  const prospect = prospects.find((p) => p.id === rec.prospectId)
  if (!prospect) return null

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Staff Recommendation</CardTitle>
          <Badge variant="outline" className="text-xs">{rec.staffRole}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{rec.staffName} says:</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Top recommendation */}
        <div className="rounded border p-3 bg-background/50">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm">{prospect.firstName} {prospect.lastName}</span>
            <Badge variant="outline">{prospect.position.primary}</Badge>
            <TierBadge tier={prospect.tier} />
            <Badge className={RATIONALE_COLORS[rec.rationale]}>
              {RATIONALE_LABELS[rec.rationale]}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1.5">
            <span>{prospect.age}yo</span>
            <span>{prospect.region}</span>
            <span>Scouted: {getScoutedOverall(prospect, playerClubId)}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{rec.rationaleText}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => onAccept(rec.prospectId)}>
              Accept Suggestion
            </Button>
            <Button size="sm" variant="outline" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>

        {/* Alternatives */}
        {suggestion.alternatives.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Alternatives considered:</p>
            {suggestion.alternatives.map((alt) => {
              const altProspect = prospects.find((p) => p.id === alt.prospectId)
              if (!altProspect) return null
              return (
                <div key={alt.prospectId} className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium truncate">
                      {altProspect.firstName} {altProspect.lastName}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-5">{altProspect.position.primary}</Badge>
                    <Badge className={`${RATIONALE_COLORS[alt.rationale]} text-[10px] h-5`}>
                      {RATIONALE_LABELS[alt.rationale]}
                    </Badge>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => onAccept(alt.prospectId)}>
                    Draft
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Delegated Draft Recap
// ---------------------------------------------------------------------------

function DelegatedDraftRecap({
  records,
  onDismiss,
}: {
  records: DelegatedPickRecord[]
  onDismiss: () => void
}) {
  if (records.length === 0) return null

  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Delegated Draft Recap</CardTitle>
          <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Your staff made {records.length} selection{records.length !== 1 ? 's' : ''} on your behalf. Here's how each pick was decided:
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-center">Pick</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Pos</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Influenced By</TableHead>
              <TableHead>Rationale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((rec) => (
              <TableRow key={rec.pickNumber}>
                <TableCell className="text-center font-mono font-bold">{rec.pickNumber}</TableCell>
                <TableCell>
                  <Link to={`/player/${rec.prospectId}`} className="font-medium hover:underline">
                    {rec.prospectName}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{rec.position}</Badge>
                </TableCell>
                <TableCell>
                  <TierBadge tier={rec.tier} />
                </TableCell>
                <TableCell>
                  <div className="text-xs">
                    <span className="font-medium">{rec.staffName}</span>
                    <span className="text-muted-foreground ml-1">({rec.staffRole})</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge className={`${RATIONALE_COLORS[rec.rationale]} text-[10px] h-5`}>
                      {RATIONALE_LABELS[rec.rationale]}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground max-w-[200px] truncate" title={rec.rationaleText}>
                      {rec.rationaleText}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TierBadge({ tier }: { tier: DraftProspect['tier'] }) {
  return (
    <Badge className={TIER_COLORS[tier]}>
      {TIER_LABELS[tier]}
    </Badge>
  )
}

function StatusBadge({
  draft,
}: {
  draft: { currentPickIndex: number; nationalDraftComplete: boolean } | null
}) {
  if (!draft) {
    return <Badge variant="secondary">Not Started</Badge>
  }
  if (draft.nationalDraftComplete) {
    return <Badge className="bg-green-600 text-white">Complete</Badge>
  }
  return <Badge className="bg-amber-500 text-black">In Progress</Badge>
}

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

function DraftSummaryCards({
  userPicks,
  prospectsRemaining,
  currentPickIndex,
  totalPicks,
}: {
  userPicks: DraftPick[]
  prospectsRemaining: number
  currentPickIndex: number
  totalPicks: number
}) {
  const nextUserPick = userPicks.find((p) => p.selectedProspectId === null)

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Picks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{userPicks.length}</div>
          <p className="text-xs text-muted-foreground">
            {userPicks.filter((p) => p.selectedProspectId !== null).length} used
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Next User Pick</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {nextUserPick ? `#${nextUserPick.pickNumber}` : '-'}
          </div>
          <p className="text-xs text-muted-foreground">
            {nextUserPick
              ? `Round ${nextUserPick.round}`
              : 'All picks made'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Prospects Remaining
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{prospectsRemaining}</div>
          <p className="text-xs text-muted-foreground">Available to draft</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Draft Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            Pick {Math.min(currentPickIndex + 1, totalPicks)} of {totalPicks}
          </div>
          <p className="text-xs text-muted-foreground">
            {totalPicks - Math.min(currentPickIndex + 1, totalPicks)} remaining
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Prospect Selection Dialog
// ---------------------------------------------------------------------------

function ProspectSelectionDialog({
  open,
  onOpenChange,
  prospects,
  draftedIds,
  playerClubId,
  pickNumber,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospects: DraftProspect[]
  draftedIds: Set<string>
  playerClubId: string
  pickNumber: number
  onSelect: (prospectId: string) => void
}) {
  const [search, setSearch] = useState('')

  const available = useMemo(() => {
    const filtered = prospects.filter((p) => !draftedIds.has(p.id))
    if (!search.trim()) return filtered
    const q = search.toLowerCase()
    return filtered.filter(
      (p) =>
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q),
    )
  }, [prospects, draftedIds, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Prospect - Pick #{pickNumber}</DialogTitle>
          <DialogDescription>
            Choose a prospect to draft with your pick.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />

        <ScrollArea className="flex-1 max-h-[55vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Pos</TableHead>
                <TableHead className="text-center">Age</TableHead>
                <TableHead>Region</TableHead>
                <TableHead className="text-center">Proj.</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-center">Overall</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {available.map((prospect) => (
                <TableRow key={prospect.id}>
                  <TableCell className="font-medium">
                    {prospect.firstName} {prospect.lastName}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      title={getProspectEligiblePositionTypes(prospect).join(', ')}
                    >
                      {prospect.position.primary}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{prospect.age}</TableCell>
                  <TableCell>{prospect.region}</TableCell>
                  <TableCell className="text-center">
                    {prospect.projectedPick}
                  </TableCell>
                  <TableCell>
                    <TierBadge tier={prospect.tier} />
                  </TableCell>
                  <TableCell className="text-center font-mono">
                    {getScoutedOverall(prospect, playerClubId)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => {
                        onSelect(prospect.id)
                        onOpenChange(false)
                      }}
                    >
                      Draft
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {available.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No prospects match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Draft Board Tab
// ---------------------------------------------------------------------------

function DraftBoardTab({
  picks,
  prospects,
  draftedIds,
  currentPickIndex,
  playerClubId,
  clubs,
  onSelectProspect,
  bestAvailable,
  teamNeeds,
  shortlists,
}: {
  picks: DraftPick[]
  prospects: DraftProspect[]
  draftedIds: Set<string>
  currentPickIndex: number
  playerClubId: string
  clubs: Record<string, { name: string; abbreviation: string }>
  onSelectProspect: (pickIndex: number, prospectId: string) => void
  bestAvailable: DraftProspect[]
  teamNeeds: PlayerPositionType[]
  shortlists: import('@/types/game').Shortlist[]
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activePick, setActivePick] = useState<{
    index: number
    pickNumber: number
  } | null>(null)

  const prospectMap = useMemo(() => {
    const map = new Map<string, DraftProspect>()
    for (const p of prospects) {
      map.set(p.id, p)
    }
    return map
  }, [prospects])

  const shortlistRows = useMemo(() => {
    const rows: Array<{ prospect: DraftProspect; shortlistName: string; priority: string }> = []
    for (const list of shortlists) {
      for (const entry of list.entries) {
        if (entry.targetType !== 'prospect') continue
        const prospect = prospectMap.get(entry.targetId)
        if (!prospect || draftedIds.has(prospect.id)) continue
        rows.push({
          prospect,
          shortlistName: list.name,
          priority: entry.priority,
        })
      }
    }
    return rows
      .sort((a, b) => rankProspectForUser(b.prospect, playerClubId) - rankProspectForUser(a.prospect, playerClubId))
      .slice(0, 10)
  }, [shortlists, prospectMap, draftedIds, playerClubId])

  const handleOpenDialog = (pickIndex: number, pickNumber: number) => {
    setActivePick({ index: pickIndex, pickNumber })
    setDialogOpen(true)
  }

  const handleSelect = (prospectId: string) => {
    if (activePick) {
      onSelectProspect(activePick.index, prospectId)
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Best Available</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bestAvailable.slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.firstName} {p.lastName}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.position.primary} • Proj #{p.projectedPick}
                  </p>
                </div>
                <ShortlistAssignMenu targetType="prospect" targetId={p.id} buttonLabel="Shortlist" buttonVariant="outline" buttonSize="sm" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Team Needs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {teamNeeds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No urgent list deficits.</p>
            ) : (
              teamNeeds.slice(0, 8).map((need) => (
                <Badge key={need} variant="outline">{need}</Badge>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Shortlist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {shortlistRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shortlisted prospects yet.</p>
            ) : (
              shortlistRows.map(({ prospect, shortlistName, priority }) => (
                <div key={`${shortlistName}-${prospect.id}`} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{prospect.firstName} {prospect.lastName}</p>
                    <p className="text-xs text-muted-foreground">{prospect.position.primary} • {shortlistName}</p>
                  </div>
                  <Badge variant={priority === 'critical' ? 'destructive' : priority === 'high' ? 'default' : 'secondary'}>{priority}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <ScrollArea className="h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center">Pick</TableHead>
              <TableHead className="w-16 text-center">Rnd</TableHead>
              <TableHead>Club</TableHead>
              <TableHead>Selection</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {picks.map((pick, i) => {
              const isComplete = pick.selectedProspectId !== null
              const isCurrent = i === currentPickIndex
              const isUserPick = pick.clubId === playerClubId
              const club = clubs[pick.clubId]
              const selectedProspect = pick.selectedProspectId
                ? prospectMap.get(pick.selectedProspectId)
                : null

              let rowClass = ''
              if (isComplete) {
                rowClass = 'bg-green-500/10'
              }
              if (isUserPick && !isComplete) {
                rowClass = 'bg-primary/10'
              }
              if (isCurrent) {
                rowClass += ' ring-2 ring-primary ring-inset animate-pulse'
              }

              return (
                <TableRow key={`${pick.pickNumber}-${pick.round}`} className={rowClass}>
                  <TableCell className="text-center font-mono font-bold">
                    {pick.pickNumber}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {pick.round}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isUserPick ? 'default' : 'secondary'}
                      >
                        {club?.abbreviation ?? pick.clubId}
                      </Badge>
                      <span className="text-sm">
                        {club?.name ?? pick.clubId}
                      </span>
                      {pick.clubId !== pick.originalClubId && (
                        <span className="text-xs text-muted-foreground">
                          (via {clubs[pick.originalClubId]?.abbreviation ?? pick.originalClubId})
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {selectedProspect ? (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {selectedProspect.firstName} {selectedProspect.lastName}
                        </span>
                        <Badge variant="outline">
                          {selectedProspect.position.primary}
                        </Badge>
                        <TierBadge tier={selectedProspect.tier} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">TBD</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isUserPick && !isComplete && isCurrent && (
                      <Button
                        size="sm"
                        onClick={() => handleOpenDialog(i, pick.pickNumber)}
                      >
                        Select Prospect
                      </Button>
                    )}
                    {pick.isBid && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        BID
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {activePick && (
        <ProspectSelectionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          prospects={prospects}
          draftedIds={draftedIds}
          playerClubId={playerClubId}
          pickNumber={activePick.pickNumber}
          onSelect={handleSelect}
        />
      )}
    </>
  )
}

function DraftPickTradeOffersCard({
  offers,
  clubs,
  onRespond,
}: {
  offers: DraftPickTradeOffer[]
  clubs: Record<string, { name: string; abbreviation: string }>
  onRespond: (offerId: string, decision: 'accept' | 'reject') => void
}) {
  if (offers.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Live Pick Trade Offers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {offers.map((offer) => (
          <div key={offer.id} className="rounded border p-3">
            <p className="text-sm font-medium">
              {clubs[offer.fromClubId]?.name ?? offer.fromClubId} offer a pick swap
            </p>
            <p className="text-xs text-muted-foreground mt-1">{offer.message}</p>
            {offer.offeredFuturePicks.length > 0 && (
              <p className="text-xs mt-1">
                Future picks offered:{' '}
                {offer.offeredFuturePicks
                  .map((p) => `${p.year} R${p.round} (${clubs[p.originalClubId]?.abbreviation ?? p.originalClubId})`)
                  .join(', ')}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => onRespond(offer.id, 'accept')}>Accept</Button>
              <Button size="sm" variant="outline" onClick={() => onRespond(offer.id, 'reject')}>Reject</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Prospect List Tab
// ---------------------------------------------------------------------------

function ProspectListTab({
  prospects,
  draftedIds,
  playerClubId,
  clubs,
}: {
  prospects: DraftProspect[]
  draftedIds: Set<string>
  playerClubId: string
  clubs: Record<string, { abbreviation: string }>
}) {
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<PlayerPositionType | ''>('')
  const [regionFilter, setRegionFilter] = useState<ScoutingRegion | ''>('')
  const [tierFilter, setTierFilter] = useState<DraftProspect['tier'] | ''>('')
  const tableColumns = useMemo<TableViewColumnConfig[]>(
    () => [
      { id: 'projectedPick', label: 'Rank', defaultWidth: 64, sortable: true },
      { id: 'name', label: 'Name', defaultWidth: 180, sortable: true },
      { id: 'position', label: 'Position', defaultWidth: 88, sortable: true },
      { id: 'age', label: 'Age', defaultWidth: 56, sortable: true },
      { id: 'height', label: 'Ht', defaultWidth: 64, sortable: true },
      { id: 'weight', label: 'Wt', defaultWidth: 64, sortable: true },
      { id: 'region', label: 'Region', defaultWidth: 84, sortable: true },
      { id: 'tier', label: 'Tier', defaultWidth: 92, sortable: true },
      { id: 'overall', label: 'Scouted', defaultWidth: 92, sortable: true },
      { id: 'potential', label: 'Potential', defaultWidth: 96, sortable: false },
      { id: 'pathway', label: 'Pathway', defaultWidth: 120, sortable: false },
      { id: 'home', label: 'Home', defaultWidth: 84, sortable: false },
      { id: 'archetype', label: 'Archetype', defaultWidth: 112, sortable: false },
      { id: 'role', label: 'Role', defaultWidth: 110, sortable: false },
      { id: 'fs', label: 'F/S', defaultWidth: 84, sortable: false },
      { id: 'status', label: '', defaultWidth: 80, sortable: false },
    ],
    [],
  )
  const tableView = useTableViewManager({
    tableId: 'draft-prospect-list',
    columns: tableColumns,
    defaultSort: { columnId: 'projectedPick', direction: 'asc' },
  })
  const sortField = (tableView.snapshot.sort?.columnId ?? 'projectedPick') as ProspectSortField
  const sortDir = tableView.snapshot.sort?.direction ?? 'asc'

  const handleSort = (field: ProspectSortField) => {
    const current = tableView.snapshot.sort
    if (current?.columnId === field) {
      tableView.setSort(field, current.direction === 'asc' ? 'desc' : 'asc')
      return
    }
    tableView.setSort(field, 'asc')
  }

  const sortIndicator = (field: ProspectSortField) => {
    if (sortField !== field) return ' \u2195'
    return sortDir === 'asc' ? ' \u2191' : ' \u2193'
  }

  const filtered = useMemo(() => {
    let list = [...prospects]

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.firstName.toLowerCase().includes(q) ||
          p.lastName.toLowerCase().includes(q) ||
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q),
      )
    }

    // Filters
    if (posFilter) {
      list = list.filter((p) => isProspectEligibleForPositionType(p, posFilter))
    }
    if (regionFilter) {
      list = list.filter((p) => p.region === regionFilter)
    }
    if (tierFilter) {
      list = list.filter((p) => p.tier === tierFilter)
    }

    // Sorting
    list.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'projectedPick':
          cmp = a.projectedPick - b.projectedPick
          break
        case 'name':
          cmp = `${a.lastName} ${a.firstName}`.localeCompare(
            `${b.lastName} ${b.firstName}`,
          )
          break
        case 'position':
          cmp = a.position.primary.localeCompare(b.position.primary)
          break
        case 'age':
          cmp = a.age - b.age
          break
        case 'height':
          cmp = a.height - b.height
          break
        case 'weight':
          cmp = a.weight - b.weight
          break
        case 'region':
          cmp = a.region.localeCompare(b.region)
          break
        case 'tier':
          cmp = tierSortOrder(a.tier) - tierSortOrder(b.tier)
          break
        case 'overall': {
          const aReport = a.scoutingReports[playerClubId]
          const bReport = b.scoutingReports[playerClubId]
          const aVal = aReport ? aReport.overallEstimate : -1
          const bVal = bReport ? bReport.overallEstimate : -1
          cmp = aVal - bVal
          break
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [prospects, search, posFilter, regionFilter, tierFilter, sortField, sortDir, playerClubId])

  const visibleColumnIds = useMemo(() => {
    const hidden = new Set(tableView.snapshot.hiddenColumnIds)
    return tableView.snapshot.columnOrder.filter((id) => !hidden.has(id))
  }, [tableView.snapshot.columnOrder, tableView.snapshot.hiddenColumnIds])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />

        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value as PlayerPositionType | '')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Positions</option>
          {ALL_POSITION_TYPES.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>

        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value as ScoutingRegion | '')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Regions</option>
          {ALL_REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          value={tierFilter}
          onChange={(e) =>
            setTierFilter(e.target.value as DraftProspect['tier'] | '')
          }
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Tiers</option>
          {ALL_TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABELS[t]}
            </option>
          ))}
        </select>

        {(search || posFilter || regionFilter || tierFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setPosFilter('')
              setRegionFilter('')
              setTierFilter('')
            }}
          >
            Clear Filters
          </Button>
        )}

        <TableViewManagerControl columns={tableColumns} manager={tableView} />
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {prospects.length} prospects
      </p>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumnIds.map((colId) => {
                    const isSortable = ['projectedPick', 'name', 'position', 'age', 'height', 'weight', 'region', 'tier', 'overall'].includes(colId)
                    const baseClass =
                      colId === 'projectedPick' || colId === 'age' || colId === 'height' || colId === 'weight' || colId === 'overall' || colId === 'potential' || colId === 'fs'
                        ? 'text-center'
                        : ''
                    const label = tableColumns.find((c) => c.id === colId)?.label ?? colId
                    return (
                      <TableHead
                        key={colId}
                        className={`${isSortable ? 'cursor-pointer select-none' : ''} ${baseClass}`}
                        style={{ width: tableView.snapshot.columnWidths[colId] ?? tableColumns.find((c) => c.id === colId)?.defaultWidth ?? 100 }}
                        onClick={() => {
                          if (!isSortable) return
                          handleSort(colId as ProspectSortField)
                        }}
                      >
                        {label}{isSortable ? sortIndicator(colId as ProspectSortField) : ''}
                      </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((prospect) => {
                  const isDrafted = draftedIds.has(prospect.id)
                  return (
                    <TableRow
                      key={prospect.id}
                      className={isDrafted ? 'opacity-40' : ''}
                    >
                      {visibleColumnIds.map((colId) => (
                        <TableCell key={`${prospect.id}-${colId}`} className={colId === 'projectedPick' || colId === 'age' || colId === 'height' || colId === 'weight' || colId === 'overall' || colId === 'potential' || colId === 'fs' ? 'text-center' : ''}>
                          {colId === 'projectedPick' && <span className="font-mono">{prospect.projectedPick}</span>}
                          {colId === 'name' && <span className="font-medium">{prospect.firstName} {prospect.lastName}</span>}
                          {colId === 'position' && (
                            <Badge variant="outline" title={getProspectEligiblePositionTypes(prospect).join(', ')}>
                              {prospect.position.primary}
                            </Badge>
                          )}
                          {colId === 'age' && prospect.age}
                          {colId === 'height' && `${prospect.height}cm`}
                          {colId === 'weight' && `${prospect.weight}kg`}
                          {colId === 'region' && prospect.region}
                          {colId === 'tier' && <TierBadge tier={prospect.tier} />}
                          {colId === 'overall' && <span className="font-mono">{getScoutedRange(prospect, playerClubId)}</span>}
                          {colId === 'potential' && <span className="font-mono">{getScoutedPotentialRange(prospect, playerClubId)}</span>}
                          {colId === 'pathway' && <span className="text-sm text-muted-foreground">{prospect.pathway}</span>}
                          {colId === 'home' && <span className="text-sm">{prospect.homeState}</span>}
                          {colId === 'archetype' && <span className="text-sm">{prospect.archetype}</span>}
                          {colId === 'role' && <span className="text-sm">{prospect.role}</span>}
                          {colId === 'fs' && (
                            prospect.linkedClubId
                              ? <Badge variant="outline" className="text-xs">{clubs[prospect.linkedClubId]?.abbreviation ?? prospect.linkedClubId}</Badge>
                              : '-'
                          )}
                          {colId === 'status' && isDrafted && (
                            <Badge variant="secondary" className="text-xs">DRAFTED</Badge>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={visibleColumnIds.length}
                      className="text-center text-muted-foreground py-8"
                    >
                      No prospects match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Draft History Tab
// ---------------------------------------------------------------------------

function DraftHistoryTab({
  clubs,
}: {
  clubs: Record<string, { name: string; abbreviation: string }>
}) {
  const history = useGameStore((s) => s.history)
  const draftHistory = history.draftHistory

  const years = useMemo(() => {
    const yearSet = new Set(draftHistory.map((d) => d.year))
    return [...yearSet].sort((a, b) => b - a)
  }, [draftHistory])

  const [selectedYear, setSelectedYear] = useState<number | null>(() => years[0] ?? null)

  const picks = useMemo(() => {
    if (selectedYear === null) return []
    return draftHistory
      .filter((d) => d.year === selectedYear)
      .sort((a, b) => a.pickNumber - b.pickNumber)
  }, [draftHistory, selectedYear])

  if (draftHistory.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground font-medium">No draft history yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Complete a draft to see historical picks here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Year:</span>
        <select
          value={selectedYear ?? ''}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-center">Pick</TableHead>
                <TableHead>Club</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {picks.map((pick) => (
                <TableRow key={`${pick.year}-${pick.pickNumber}`}>
                  <TableCell className="text-center font-mono font-bold">
                    {pick.pickNumber}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {clubs[pick.clubId]?.abbreviation ?? pick.clubId}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/player/${pick.playerId}`}
                      className="font-medium hover:underline"
                    >
                      {pick.playerName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{pick.position}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {picks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No picks for this year.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function DraftPage() {
  const draft = useGameStore((s) => s.draft)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)
  const settings = useGameStore((s) => s.settings)
  const runDraftCombineAction = useGameStore((s) => s.runDraftCombineAction)
  const startLiveDraftAction = useGameStore((s) => s.startLiveDraftAction)
  const advanceDraftToNextUserPickAction = useGameStore((s) => s.advanceDraftToNextUserPickAction)
  const makeUserDraftSelectionAction = useGameStore((s) => s.makeUserDraftSelectionAction)
  const respondToDraftPickTradeOfferAction = useGameStore((s) => s.respondToDraftPickTradeOfferAction)
  const suggestNextDraftPickAction = useGameStore((s) => s.suggestNextDraftPickAction)
  const runDelegatedDraftAction = useGameStore((s) => s.runDelegatedDraftAction)
  const players = useGameStore((s) => s.players)
  const shortlists = useGameStore((s) => s.shortlists)
  const simulationActive = useGameStore((s) => s.simulation.active)

  const [suggestion, setSuggestion] = useState<SuggestNextPickResult | null>(null)
  const [delegatedRecords, setDelegatedRecords] = useState<DelegatedPickRecord[]>([])
  const [showDelegateConfirm, setShowDelegateConfirm] = useState(false)

  const picks: DraftPick[] = useMemo(() => {
    if (!draft) return []
    return draft.nationalDraftPicks
  }, [draft])

  const draftedIds = useMemo(() => {
    if (!draft) return new Set<string>()
    return new Set(draft.draftedProspectIds)
  }, [draft])

  const userPicks = useMemo(
    () => picks.filter((p) => p.clubId === playerClubId),
    [picks, playerClubId],
  )

  const prospectsRemaining = draft
    ? draft.prospects.length - draftedIds.size
    : 0

  const availableProspects = useMemo(
    () => (draft ? draft.prospects.filter((p) => !draftedIds.has(p.id)) : []),
    [draft, draftedIds],
  )

  const bestAvailable = useMemo(
    () =>
      [...availableProspects]
        .sort((a, b) => rankProspectForUser(b, playerClubId) - rankProspectForUser(a, playerClubId))
        .slice(0, 20),
    [availableProspects, playerClubId],
  )

  const teamNeeds = useMemo(
    () => deriveTeamNeeds(players, playerClubId),
    [players, playerClubId],
  )

  const handleSelectProspect = (pickIndex: number, prospectId: string) => {
    if (simulationActive) return
    if (!draft || pickIndex !== draft.currentPickIndex) return
    makeUserDraftSelectionAction(prospectId)
  }

  const handleSuggestPick = () => {
    const result = suggestNextDraftPickAction()
    setSuggestion(result)
  }

  const handleAcceptSuggestion = (prospectId: string) => {
    if (simulationActive) return
    if (!draft || draft.currentPickIndex < 0) return
    const pick = draft.nationalDraftPicks[draft.currentPickIndex]
    if (!pick || pick.clubId !== playerClubId) return
    setSuggestion(null)
    makeUserDraftSelectionAction(prospectId)
  }

  const handleDelegateDraft = () => {
    if (simulationActive) return
    setShowDelegateConfirm(false)
    const result = runDelegatedDraftAction()
    if (result.success && result.records.length > 0) {
      setDelegatedRecords(result.records)
    }
  }

  // Clear suggestion when pick changes
  const currentPickIndexForEffect = draft?.currentPickIndex ?? -1
  useEffect(() => {
    setSuggestion(null)
  }, [currentPickIndexForEffect])

  const pendingPickTradeOffers = useMemo(
    () => (draft?.pickTradeOffers ?? []).filter((o) => o.status === 'pending'),
    [draft],
  )

  // Derive year from draft or current year
  const year = draft?.year ?? new Date().getFullYear()

  // ---------------------------------------------------------------------------
  // No draft active
  // ---------------------------------------------------------------------------
  if (!draft) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">National Draft {year}</h1>
          <StatusBadge draft={null} />
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="text-lg font-semibold mb-2">Draft Not Available</h2>
            <p className="text-muted-foreground max-w-md">
              The draft will be available during the post-season phase. Complete
              the season to access the draft.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Draft active
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">National Draft {draft.year}</h1>
        <StatusBadge draft={draft} />
      </div>

      <Separator />

      {/* Summary Cards */}
      <DraftSummaryCards
        userPicks={userPicks}
        prospectsRemaining={prospectsRemaining}
        currentPickIndex={draft.currentPickIndex}
        totalPicks={picks.length}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Draft Class Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">Strength: {draft.classProfile.strength}</Badge>
          <Badge variant="outline">Score: {draft.classProfile.strengthScore}</Badge>
          <Badge variant="outline">Top-End: {draft.classProfile.topEndTalent}</Badge>
          <Badge variant="outline">Depth: {draft.classProfile.depthRating}</Badge>
          <Badge variant={settings.realism.draftVariance ? 'default' : 'secondary'}>
            Bust/Late-Bloomer Variance: {settings.realism.draftVariance ? 'On' : 'Off'}
          </Badge>
          <Badge variant={draft.combineCompleted ? 'default' : 'secondary'}>
            Combine: {draft.combineCompleted ? `Completed (${draft.combineDate ?? 'N/A'})` : 'Pending'}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runDraftCombineAction()}
            disabled={draft.combineCompleted || simulationActive}
          >
            Run Draft Combine
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => startLiveDraftAction()}
            disabled={draft.nationalDraftComplete || simulationActive}
          >
            {draft.currentPickIndex < 0 ? 'Start Live Draft' : 'Resume Draft'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => advanceDraftToNextUserPickAction()}
            disabled={draft.nationalDraftComplete || simulationActive}
          >
            Advance To My Pick
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={handleSuggestPick}
            disabled={
              draft.nationalDraftComplete ||
              simulationActive ||
              draft.currentPickIndex < 0 ||
              draft.nationalDraftPicks[draft.currentPickIndex]?.clubId !== playerClubId
            }
          >
            Suggest Pick
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowDelegateConfirm(true)}
            disabled={draft.nationalDraftComplete || simulationActive}
          >
            Delegate to Staff
          </Button>
        </CardContent>
      </Card>

      {/* Delegate Confirmation Dialog */}
      <Dialog open={showDelegateConfirm} onOpenChange={setShowDelegateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delegate Draft to Staff?</DialogTitle>
            <DialogDescription>
              Your recruiting staff will make all remaining draft picks on your behalf.
              You won't be able to intervene once the draft starts running.
              A full recap with staff rationale for each pick will be shown when complete.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDelegateConfirm(false)}>Cancel</Button>
            <Button onClick={handleDelegateDraft}>Delegate All Picks</Button>
          </div>
        </DialogContent>
      </Dialog>

      <DraftPickTradeOffersCard
        offers={pendingPickTradeOffers}
        clubs={clubs}
        onRespond={(offerId, decision) => {
          if (simulationActive) return
          respondToDraftPickTradeOfferAction(offerId, decision)
        }}
      />

      {/* Staff Suggestion */}
      {suggestion && !draft.nationalDraftComplete && (
        <StaffSuggestionCard
          suggestion={suggestion}
          prospects={draft.prospects}
          playerClubId={playerClubId}
          onAccept={handleAcceptSuggestion}
          onDismiss={() => setSuggestion(null)}
        />
      )}

      {/* Delegated Draft Recap */}
      {delegatedRecords.length > 0 && (
        <DelegatedDraftRecap
          records={delegatedRecords}
          onDismiss={() => setDelegatedRecords([])}
        />
      )}

      {/* Tabs */}
      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Draft Board</TabsTrigger>
          <TabsTrigger value="prospects">Prospect List</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="shortlists">Shortlists</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          <DraftBoardTab
            picks={picks}
            prospects={draft.prospects}
            draftedIds={draftedIds}
            currentPickIndex={draft.currentPickIndex}
            playerClubId={playerClubId}
            clubs={clubs}
            onSelectProspect={handleSelectProspect}
            bestAvailable={bestAvailable}
            teamNeeds={teamNeeds}
            shortlists={shortlists}
          />
        </TabsContent>

        <TabsContent value="prospects">
          <ProspectListTab
            prospects={draft.prospects}
            draftedIds={draftedIds}
            playerClubId={playerClubId}
            clubs={clubs}
          />
        </TabsContent>

        <TabsContent value="history">
          <DraftHistoryTab clubs={clubs} />
        </TabsContent>

        <TabsContent value="shortlists">
          <ShortlistManager targetTypeFilter="prospect" title="Draft Board Shortlists" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

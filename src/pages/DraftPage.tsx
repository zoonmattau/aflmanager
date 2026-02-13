import { useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { DraftProspect, DraftPick, ScoutingRegion } from '@/types/draft'
import type { PositionGroup } from '@/types/player'
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

const ALL_POSITIONS: PositionGroup[] = [
  'FB', 'HB', 'C', 'HF', 'FF', 'FOLL', 'INT', 'MID', 'WING',
]

const ALL_REGIONS: ScoutingRegion[] = [
  'VIC', 'SA', 'WA', 'NSW/ACT', 'QLD', 'TAS/NT',
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
                    <Badge variant="outline">{prospect.position.primary}</Badge>
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
}: {
  picks: DraftPick[]
  prospects: DraftProspect[]
  draftedIds: Set<string>
  currentPickIndex: number
  playerClubId: string
  clubs: Record<string, { name: string; abbreviation: string }>
  onSelectProspect: (pickIndex: number, prospectId: string) => void
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
                    {isUserPick && !isComplete && (
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
  const [posFilter, setPosFilter] = useState<PositionGroup | ''>('')
  const [regionFilter, setRegionFilter] = useState<ScoutingRegion | ''>('')
  const [tierFilter, setTierFilter] = useState<DraftProspect['tier'] | ''>('')
  const [sortField, setSortField] = useState<ProspectSortField>('projectedPick')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: ProspectSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
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
      list = list.filter((p) => p.position.primary === posFilter)
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
          onChange={(e) => setPosFilter(e.target.value as PositionGroup | '')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Positions</option>
          {ALL_POSITIONS.map((pos) => (
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
                  <TableHead
                    className="w-16 cursor-pointer select-none text-center"
                    onClick={() => handleSort('projectedPick')}
                  >
                    Rank{sortIndicator('projectedPick')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort('name')}
                  >
                    Name{sortIndicator('name')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort('position')}
                  >
                    Position{sortIndicator('position')}
                  </TableHead>
                  <TableHead
                    className="w-14 cursor-pointer select-none text-center"
                    onClick={() => handleSort('age')}
                  >
                    Age{sortIndicator('age')}
                  </TableHead>
                  <TableHead
                    className="w-16 cursor-pointer select-none text-center"
                    onClick={() => handleSort('height')}
                  >
                    Ht{sortIndicator('height')}
                  </TableHead>
                  <TableHead
                    className="w-16 cursor-pointer select-none text-center"
                    onClick={() => handleSort('weight')}
                  >
                    Wt{sortIndicator('weight')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort('region')}
                  >
                    Region{sortIndicator('region')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort('tier')}
                  >
                    Tier{sortIndicator('tier')}
                  </TableHead>
                  <TableHead
                    className="w-24 cursor-pointer select-none text-center"
                    onClick={() => handleSort('overall')}
                  >
                    Scouted{sortIndicator('overall')}
                  </TableHead>
                  <TableHead>Pathway</TableHead>
                  <TableHead className="text-center">F/S</TableHead>
                  <TableHead className="w-20" />
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
                      <TableCell className="text-center font-mono">
                        {prospect.projectedPick}
                      </TableCell>
                      <TableCell className="font-medium">
                        {prospect.firstName} {prospect.lastName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {prospect.position.primary}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {prospect.age}
                      </TableCell>
                      <TableCell className="text-center">
                        {prospect.height}cm
                      </TableCell>
                      <TableCell className="text-center">
                        {prospect.weight}kg
                      </TableCell>
                      <TableCell>{prospect.region}</TableCell>
                      <TableCell>
                        <TierBadge tier={prospect.tier} />
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {getScoutedRange(prospect, playerClubId)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {prospect.pathway}
                      </TableCell>
                      <TableCell className="text-center">
                        {prospect.linkedClubId
                          ? (
                            <Badge variant="outline" className="text-xs">
                              {clubs[prospect.linkedClubId]?.abbreviation ??
                                prospect.linkedClubId}
                            </Badge>
                          )
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {isDrafted && (
                          <Badge variant="secondary" className="text-xs">
                            DRAFTED
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={12}
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
// Main Page Component
// ---------------------------------------------------------------------------

export function DraftPage() {
  const draft = useGameStore((s) => s.draft)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)

  // Local draft state for UI-only pick tracking (store actions not yet available)
  const [localSelections, setLocalSelections] = useState<
    Record<number, string>
  >({})

  // Merge store draft data with local selections
  const picks: DraftPick[] = useMemo(() => {
    if (!draft) return []
    return draft.nationalDraftPicks.map((pick, i) => ({
      ...pick,
      selectedProspectId:
        localSelections[i] ?? pick.selectedProspectId,
    }))
  }, [draft, localSelections])

  const draftedIds = useMemo(() => {
    if (!draft) return new Set<string>()
    const ids = new Set(draft.draftedProspectIds)
    for (const id of Object.values(localSelections)) {
      ids.add(id)
    }
    return ids
  }, [draft, localSelections])

  const userPicks = useMemo(
    () => picks.filter((p) => p.clubId === playerClubId),
    [picks, playerClubId],
  )

  const prospectsRemaining = draft
    ? draft.prospects.length - draftedIds.size
    : 0

  const handleSelectProspect = (pickIndex: number, prospectId: string) => {
    setLocalSelections((prev) => ({ ...prev, [pickIndex]: prospectId }))
  }

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

      {/* Tabs */}
      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Draft Board</TabsTrigger>
          <TabsTrigger value="prospects">Prospect List</TabsTrigger>
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
      </Tabs>
    </div>
  )
}

import { useMemo, useState, useCallback, Fragment } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { Scout, ScoutingRegion, DraftProspect, ScoutingReport } from '@/types/draft'
import type { PlayerAttributes } from '@/types/player'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_REGIONS: ScoutingRegion[] = ['VIC', 'SA', 'WA', 'NSW/ACT', 'QLD', 'TAS/NT']

const TIER_OPTIONS = ['elite', 'first-round', 'second-round', 'late', 'rookie-list'] as const

const TIER_LABELS: Record<string, string> = {
  elite: 'Elite',
  'first-round': '1st Round',
  'second-round': '2nd Round',
  late: 'Late',
  'rookie-list': 'Rookie List',
}

const MAX_SCOUTS = 4

type SortKey = 'confidence' | 'overallEstimate' | 'projectedPick'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSalary(value: number): string {
  if (value >= 1_000) {
    return '$' + Math.round(value / 1_000) + 'k'
  }
  return '$' + value.toLocaleString('en-AU')
}

function skillColor(skill: number): string {
  if (skill >= 70) return 'bg-green-500'
  if (skill >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

function skillTextColor(skill: number): string {
  if (skill >= 70) return 'text-green-600 dark:text-green-400'
  if (skill >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function tierVariant(tier: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (tier) {
    case 'elite':
      return 'default'
    case 'first-round':
      return 'secondary'
    case 'second-round':
      return 'outline'
    default:
      return 'outline'
  }
}

function midpointQualityColor(low: number, high: number): string {
  const mid = (low + high) / 2
  if (mid >= 75) return 'bg-green-500'
  if (mid >= 60) return 'bg-emerald-400'
  if (mid >= 45) return 'bg-yellow-500'
  if (mid >= 30) return 'bg-orange-500'
  return 'bg-red-500'
}

/** Produce a human-readable label from a camelCase attribute key. */
function formatAttributeName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

/** All attribute keys from PlayerAttributes, grouped logically. */
const ATTRIBUTE_KEYS: (keyof PlayerAttributes)[] = [
  'kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap',
  'handballEfficiency', 'handballDistance', 'handballReceive',
  'markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested',
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
  'tackling', 'contested', 'clearance', 'hardness',
  'disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure',
  'goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct',
  'intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding',
  'hitouts', 'ruckCreative', 'followUp',
  'pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch',
  'centreBounce', 'boundaryThrowIn', 'stoppage',
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoutSkillBar({ skill }: { skill: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${skillColor(skill)}`}
          style={{ width: `${skill}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-7 text-right ${skillTextColor(skill)}`}>
        {skill}
      </span>
    </div>
  )
}

function RegionAssignSelect({
  currentRegion,
  onAssign,
}: {
  currentRegion: ScoutingRegion | null
  onAssign: (region: ScoutingRegion | null) => void
}) {
  return (
    <Select
      value={currentRegion ?? '__none__'}
      onValueChange={(v) => onAssign(v === '__none__' ? null : (v as ScoutingRegion))}
    >
      <SelectTrigger className="w-[130px] h-8 text-xs">
        <SelectValue placeholder="Assign..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Unassigned</SelectItem>
        {ALL_REGIONS.map((r) => (
          <SelectItem key={r} value={r}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function AttributeRangeBar({
  attrKey,
  range,
}: {
  attrKey: keyof PlayerAttributes
  range: [number, number] | undefined
}) {
  if (!range) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-[140px] truncate">
          {formatAttributeName(attrKey)}
        </span>
        <div className="flex-1 h-4 rounded bg-muted relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground">Unknown</span>
          </div>
        </div>
      </div>
    )
  }

  const [low, high] = range
  const leftPct = low
  const widthPct = Math.max(high - low, 1)

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-[140px] truncate">
        {formatAttributeName(attrKey)}
      </span>
      <div className="flex-1 h-4 rounded bg-muted relative">
        <div
          className={`absolute top-0 bottom-0 rounded ${midpointQualityColor(low, high)}`}
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            minWidth: '2px',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-between px-1">
          <span className="text-[10px] font-mono text-white mix-blend-difference">
            {low}
          </span>
          <span className="text-[10px] font-mono text-white mix-blend-difference">
            {high}
          </span>
        </div>
      </div>
    </div>
  )
}

function ProspectExpandedRow({
  prospect,
  report,
}: {
  prospect: DraftProspect
  report: ScoutingReport | null
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Height:</span>{' '}
          <span className="font-medium">{prospect.height}cm</span>
        </div>
        <div>
          <span className="text-muted-foreground">Weight:</span>{' '}
          <span className="font-medium">{prospect.weight}kg</span>
        </div>
        <div>
          <span className="text-muted-foreground">Position:</span>{' '}
          <span className="font-medium">
            {prospect.position.primary}
            {prospect.position.secondary.length > 0
              ? ` / ${prospect.position.secondary.join(', ')}`
              : ''}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Tier:</span>{' '}
          <Badge variant={tierVariant(prospect.tier)} className="ml-1">
            {TIER_LABELS[prospect.tier] ?? prospect.tier}
          </Badge>
        </div>
      </div>

      {report ? (
        <div className="space-y-1.5">
          <h4 className="text-sm font-semibold">
            Attribute Ranges (Confidence: {Math.round(report.confidence * 100)}%)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            {ATTRIBUTE_KEYS.map((key) => (
              <AttributeRangeBar
                key={key}
                attrKey={key}
                range={report.attributeRanges[key]}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No scouting report available. Assign a scout to the{' '}
          <span className="font-medium">{prospect.region}</span> region to begin scouting.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// My Scouts Tab
// ---------------------------------------------------------------------------

function MyScoutsTab({
  myScouts,
  availableScouts,
  prospects,
  onAssignRegion,
  onFireScout,
  onHireScout,
}: {
  myScouts: Scout[]
  availableScouts: Scout[]
  prospects: DraftProspect[]
  onAssignRegion: (scoutId: string, region: ScoutingRegion | null) => void
  onFireScout: (scoutId: string) => void
  onHireScout: (scoutId: string) => void
}) {
  // Coverage map data
  const coverageData = useMemo(() => {
    return ALL_REGIONS.map((region) => {
      const scoutsInRegion = myScouts.filter((s) => s.assignedRegion === region)
      const prospectsInRegion = prospects.filter((p) => p.region === region)
      return {
        region,
        scoutCount: scoutsInRegion.length,
        prospectCount: prospectsInRegion.length,
        scouts: scoutsInRegion,
      }
    })
  }, [myScouts, prospects])

  return (
    <div className="space-y-6">
      {/* Scout Roster */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Scout Roster</span>
            <Badge variant="outline" className="text-xs font-normal">
              {myScouts.length} / {MAX_SCOUTS}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myScouts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                You have no scouts hired. Hire scouts from the available pool below to begin
                scouting draft prospects.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myScouts.map((scout) => (
                <div
                  key={scout.id}
                  className="flex items-center gap-4 rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {scout.firstName} {scout.lastName}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {formatSalary(scout.salary)}
                      </Badge>
                      {scout.assignedRegion ? (
                        <Badge variant="secondary" className="text-xs">
                          {scout.assignedRegion}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs text-muted-foreground border-dashed"
                        >
                          Unassigned
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <ScoutSkillBar skill={scout.skill} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <RegionAssignSelect
                      currentRegion={scout.assignedRegion}
                      onAssign={(region) => onAssignRegion(scout.id, region)}
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => onFireScout(scout.id)}
                    >
                      Fire
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coverage Map */}
      <Card>
        <CardHeader>
          <CardTitle>Region Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {coverageData.map((data) => (
              <div
                key={data.region}
                className={`rounded-lg border p-3 ${
                  data.scoutCount > 0
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-dashed'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{data.region}</span>
                  {data.scoutCount > 0 ? (
                    <Badge
                      variant="default"
                      className="text-[10px] h-5 bg-green-600"
                    >
                      Covered
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-5 text-muted-foreground"
                    >
                      No scout
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>
                    Scouts: <span className="font-medium text-foreground">{data.scoutCount}</span>
                  </p>
                  <p>
                    Prospects:{' '}
                    <span className="font-medium text-foreground">{data.prospectCount}</span>
                  </p>
                  {data.scouts.length > 0 && (
                    <p className="truncate">
                      {data.scouts.map((s) => `${s.firstName} ${s.lastName}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Available Scouts */}
      <Card>
        <CardHeader>
          <CardTitle>Available Scouts</CardTitle>
        </CardHeader>
        <CardContent>
          {availableScouts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No scouts are currently available for hire.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableScouts.map((scout) => (
                <div
                  key={scout.id}
                  className="flex items-center gap-4 rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {scout.firstName} {scout.lastName}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {formatSalary(scout.salary)}
                      </Badge>
                    </div>
                    <div className="mt-1.5">
                      <ScoutSkillBar skill={scout.skill} />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={myScouts.length >= MAX_SCOUTS}
                    onClick={() => onHireScout(scout.id)}
                  >
                    {myScouts.length >= MAX_SCOUTS ? 'Roster Full' : 'Hire'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Prospect Reports Tab
// ---------------------------------------------------------------------------

function ProspectReportsTab({
  prospects,
  playerClubId,
}: {
  prospects: DraftProspect[] | null
  playerClubId: string
}) {
  const [regionFilter, setRegionFilter] = useState<string>('__all__')
  const [tierFilter, setTierFilter] = useState<string>('__all__')
  const [scoutedOnly, setScoutedOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('projectedPick')
  const [sortAsc, setSortAsc] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    if (!prospects) return []

    let list = [...prospects]

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (p) =>
          p.firstName.toLowerCase().includes(q) ||
          p.lastName.toLowerCase().includes(q),
      )
    }

    // Region filter
    if (regionFilter !== '__all__') {
      list = list.filter((p) => p.region === regionFilter)
    }

    // Tier filter
    if (tierFilter !== '__all__') {
      list = list.filter((p) => p.tier === tierFilter)
    }

    // Scouted only
    if (scoutedOnly) {
      list = list.filter((p) => p.scoutingReports[playerClubId] != null)
    }

    // Sort
    list.sort((a, b) => {
      const reportA = a.scoutingReports[playerClubId]
      const reportB = b.scoutingReports[playerClubId]

      let valA: number
      let valB: number

      switch (sortKey) {
        case 'confidence':
          valA = reportA?.confidence ?? -1
          valB = reportB?.confidence ?? -1
          break
        case 'overallEstimate':
          valA = reportA?.overallEstimate ?? -1
          valB = reportB?.overallEstimate ?? -1
          break
        case 'projectedPick':
        default:
          valA = a.projectedPick
          valB = b.projectedPick
          break
      }

      return sortAsc ? valA - valB : valB - valA
    })

    return list
  }, [prospects, regionFilter, tierFilter, scoutedOnly, sortKey, sortAsc, playerClubId, searchQuery])

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortAsc((prev) => !prev)
      } else {
        setSortKey(key)
        setSortAsc(key === 'projectedPick')
      }
    },
    [sortKey],
  )

  if (!prospects) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <p className="text-lg font-medium text-muted-foreground">
              No draft class available yet
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              The draft class will be generated as the season progresses.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null
    return sortAsc ? ' \u2191' : ' \u2193'
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-[200px] h-8 text-sm"
            />
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Regions</SelectItem>
                {ALL_REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Tiers</SelectItem>
                {TIER_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIER_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                checked={scoutedOnly}
                onCheckedChange={setScoutedOnly}
                size="sm"
              />
              <span className="text-xs text-muted-foreground">Scouted only</span>
            </div>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} prospect{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3">Name</TableHead>
                  <TableHead className="px-3">Position</TableHead>
                  <TableHead className="px-3 text-center">Age</TableHead>
                  <TableHead className="px-3">Region</TableHead>
                  <TableHead
                    className="px-3 text-center cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('projectedPick')}
                  >
                    Proj. Pick{sortIndicator('projectedPick')}
                  </TableHead>
                  <TableHead
                    className="px-3 cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('confidence')}
                  >
                    Confidence{sortIndicator('confidence')}
                  </TableHead>
                  <TableHead
                    className="px-3 text-center cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('overallEstimate')}
                  >
                    Est. OVR{sortIndicator('overallEstimate')}
                  </TableHead>
                  <TableHead className="px-3 text-center">Sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No prospects match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((prospect) => {
                    const report: ScoutingReport | undefined =
                      prospect.scoutingReports[playerClubId]
                    const isExpanded = expandedId === prospect.id

                    return (
                      <Fragment key={prospect.id}>
                        <TableRow
                          className="text-sm cursor-pointer hover:bg-accent/50"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : prospect.id)
                          }
                        >
                          <TableCell className="px-3 font-medium">
                            <span className="hover:underline">
                              {prospect.firstName} {prospect.lastName}
                            </span>
                          </TableCell>
                          <TableCell className="px-3">
                            <Badge variant="outline" className="text-xs">
                              {prospect.position.primary}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 text-center">
                            {prospect.age}
                          </TableCell>
                          <TableCell className="px-3">
                            <Badge variant="secondary" className="text-xs">
                              {prospect.region}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 text-center font-mono">
                            {prospect.projectedPick}
                          </TableCell>
                          <TableCell className="px-3">
                            {report ? (
                              <div className="flex items-center gap-2 min-w-[100px]">
                                <Progress
                                  value={Math.round(report.confidence * 100)}
                                  className="flex-1 h-2"
                                />
                                <span className="text-xs tabular-nums w-8 text-right">
                                  {Math.round(report.confidence * 100)}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell className="px-3 text-center font-mono">
                            {report ? (
                              <span
                                className={
                                  report.overallEstimate >= 70
                                    ? 'text-green-600 dark:text-green-400 font-semibold'
                                    : report.overallEstimate >= 50
                                      ? 'text-yellow-600 dark:text-yellow-400'
                                      : ''
                                }
                              >
                                {Math.round(report.overallEstimate)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">?</span>
                            )}
                          </TableCell>
                          <TableCell className="px-3 text-center tabular-nums">
                            {report ? report.sessionsCompleted : '--'}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="p-0 bg-muted/30">
                              <ProspectExpandedRow
                                prospect={prospect}
                                report={report ?? null}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

function SummaryCards({
  myScouts,
  prospects,
  playerClubId,
}: {
  myScouts: Scout[]
  prospects: DraftProspect[] | null
  playerClubId: string
}) {
  const regionsCovered = useMemo(() => {
    const regions = new Set(
      myScouts.filter((s) => s.assignedRegion).map((s) => s.assignedRegion),
    )
    return regions.size
  }, [myScouts])

  const { prospectsScouted, avgConfidence } = useMemo(() => {
    if (!prospects) return { prospectsScouted: 0, avgConfidence: 0 }

    const scouted = prospects.filter((p) => p.scoutingReports[playerClubId] != null)
    const count = scouted.length
    const avg =
      count > 0
        ? scouted.reduce(
            (sum, p) => sum + (p.scoutingReports[playerClubId]?.confidence ?? 0),
            0,
          ) / count
        : 0

    return { prospectsScouted: count, avgConfidence: avg }
  }, [prospects, playerClubId])

  const totalSalary = useMemo(
    () => myScouts.reduce((sum, s) => sum + s.salary, 0),
    [myScouts],
  )

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Card>
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Scouts Hired</p>
          <p className="text-2xl font-bold">
            {myScouts.length}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              / {MAX_SCOUTS}
            </span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Regions Covered</p>
          <p className="text-2xl font-bold">
            {regionsCovered}{' '}
            <span className="text-sm font-normal text-muted-foreground">/ 6</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Prospects Scouted</p>
          <p className="text-2xl font-bold">{prospectsScouted}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Avg Confidence</p>
          <p className="text-2xl font-bold">
            {prospectsScouted > 0 ? `${Math.round(avgConfidence * 100)}%` : '--'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Total Scout Salary</p>
          <p className="text-2xl font-bold">
            {totalSalary > 0 ? formatSalary(totalSalary) : '$0'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function ScoutingPage() {
  const scouts = useGameStore((s) => s.scouts)
  const draft = useGameStore((s) => s.draft)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const clubs = useGameStore((s) => s.clubs)

  const club = clubs[playerClubId]

  // Local state for scout management (store actions not wired yet)
  const [localScouts, setLocalScouts] = useState<Scout[]>(() => [...scouts])

  // Keep local scouts in sync if global scouts change (e.g., on mount)
  // We use the store as initial value but manage locally from there.
  const myScouts = useMemo(
    () => localScouts.filter((s) => s.clubId === playerClubId),
    [localScouts, playerClubId],
  )

  const availableScouts = useMemo(
    () => localScouts.filter((s) => s.clubId === ''),
    [localScouts],
  )

  const prospects = draft?.prospects ?? null

  const handleAssignRegion = useCallback(
    (scoutId: string, region: ScoutingRegion | null) => {
      setLocalScouts((prev) =>
        prev.map((s) => (s.id === scoutId ? { ...s, assignedRegion: region } : s)),
      )
    },
    [],
  )

  const handleFireScout = useCallback(
    (scoutId: string) => {
      const scout = localScouts.find((s) => s.id === scoutId)
      if (scout) {
        // eslint-disable-next-line no-alert
        alert(
          `Fire scout: ${scout.firstName} ${scout.lastName}\n\n(Store actions not yet implemented. This will be wired up when scout actions are added to the game store.)`,
        )
      }
      setLocalScouts((prev) =>
        prev.map((s) =>
          s.id === scoutId ? { ...s, clubId: '', assignedRegion: null } : s,
        ),
      )
    },
    [localScouts],
  )

  const handleHireScout = useCallback(
    (scoutId: string) => {
      setLocalScouts((prev) =>
        prev.map((s) =>
          s.id === scoutId ? { ...s, clubId: playerClubId } : s,
        ),
      )
    },
    [playerClubId],
  )

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Scouting Department</h1>
        <p className="text-sm text-muted-foreground">
          {club?.fullName ?? 'Your Club'}
        </p>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        myScouts={myScouts}
        prospects={prospects}
        playerClubId={playerClubId}
      />

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="scouts">
        <TabsList>
          <TabsTrigger value="scouts">My Scouts</TabsTrigger>
          <TabsTrigger value="prospects">Prospect Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="scouts">
          <MyScoutsTab
            myScouts={myScouts}
            availableScouts={availableScouts}
            prospects={prospects ?? []}
            onAssignRegion={handleAssignRegion}
            onFireScout={handleFireScout}
            onHireScout={handleHireScout}
          />
        </TabsContent>

        <TabsContent value="prospects">
          <ProspectReportsTab
            prospects={prospects}
            playerClubId={playerClubId}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

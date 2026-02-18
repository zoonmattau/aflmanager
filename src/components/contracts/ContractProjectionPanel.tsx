import { useMemo, type ReactNode } from 'react'
import { useGameStore } from '@/stores/gameStore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
} from 'lucide-react'
import {
  projectContractValue,
  type ConfidenceLevel,
  type ProjectionRiskFlag,
  type ContractProjection,
} from '@/engine/contracts/contractProjection'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(value: number): string {
  return '$' + value.toLocaleString('en-AU', { maximumFractionDigits: 0 })
}

function formatDemandDelta(value: number): ReactNode {
  if (value === 0) return <span className="text-muted-foreground">-</span>
  // Demand decreasing = green (good for club), increasing = red
  const isPositive = value > 0
  const color = isPositive ? 'text-red-500' : 'text-green-500'
  const prefix = isPositive ? '+' : ''
  return <span className={color}>{prefix}{formatDollars(Math.abs(value)).replace('$', isPositive ? '+$' : '-$')}</span>
}

function formatOverallDelta(value: number): ReactNode {
  if (Math.abs(value) < 0.05) return <span className="text-muted-foreground">-</span>
  const isPositive = value > 0
  const color = isPositive ? 'text-green-500' : 'text-red-500'
  const prefix = isPositive ? '+' : ''
  return <span className={color}>{prefix}{value.toFixed(1)}</span>
}

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  'high': 'bg-green-500/15 text-green-600 border-green-500/30',
  'medium': 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  'low': 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  'very-low': 'bg-red-500/15 text-red-600 border-red-500/30',
}

const RISK_LABELS: Record<ProjectionRiskFlag, { label: string; color: string }> = {
  'injury-prone': { label: 'Injury Prone', color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  'aging-decline': { label: 'Aging', color: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  'steep-decline': { label: 'Steep Decline', color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  'approaching-retirement': { label: 'Near Retirement', color: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  'untested-youth': { label: 'Untested', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  'high-potential': { label: 'High Potential', color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
}

function TrajectoryIcon({ trajectory }: { trajectory: ContractProjection['trajectory'] }) {
  switch (trajectory) {
    case 'rising':
      return <TrendingUp className="h-4 w-4 text-red-500" />
    case 'declining':
      return <TrendingDown className="h-4 w-4 text-green-500" />
    case 'stable':
      return <Minus className="h-4 w-4 text-muted-foreground" />
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ContractProjectionPanelProps {
  playerId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContractProjectionPanel({
  playerId,
  open,
  onOpenChange,
}: ContractProjectionPanelProps) {
  const players = useGameStore((s) => s.players)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const awards = useGameStore((s) => s.awards)

  const player = playerId ? players[playerId] : null

  const clubPlayers = useMemo(
    () => Object.values(players).filter((p) => p.clubId === playerClubId),
    [players, playerClubId],
  )

  const projection = useMemo(() => {
    if (!player) return null
    return projectContractValue(player, 5, {
      clubPlayers,
      awards,
      currentClubId: playerClubId,
    })
  }, [player, clubPlayers, awards, playerClubId])

  if (!player || !projection) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contract Projection</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4 text-center">
            No player selected.
          </p>
        </DialogContent>
      </Dialog>
    )
  }

  const maxDemand = Math.max(
    projection.currentDemand,
    ...projection.projections.map((p) => p.projectedDemand),
  )

  // Aggregate risk flags across all years
  const allRiskFlags = new Set<ProjectionRiskFlag>()
  for (const p of projection.projections) {
    for (const flag of p.riskFlags) {
      allRiskFlags.add(flag)
    }
  }

  // Recommendation text
  let recommendationTitle: string
  let recommendationDesc: string
  if (projection.trajectory === 'rising') {
    recommendationTitle = 'Best to negotiate now'
    recommendationDesc =
      'Projected demand is rising — locking in a deal sooner will likely cost less.'
  } else if (projection.trajectory === 'declining') {
    recommendationTitle = 'Consider waiting'
    recommendationDesc =
      'Projected demand is declining — the player may accept a cheaper deal in future years.'
  } else {
    recommendationTitle = 'Demand stable'
    recommendationDesc =
      'Projected demand is relatively stable over the forecast window.'
  }

  const optimalProjection = projection.projections.find(
    (p) => p.yearOffset === projection.optimalNegotiationYear,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Contract Projection
            <TrajectoryIcon trajectory={projection.trajectory} />
          </DialogTitle>
          <DialogDescription>
            5-year demand forecast for {projection.playerName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header Info */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Player</span>
              <p className="font-semibold">
                {projection.playerName}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Position / Age</span>
              <p className="font-semibold">
                {player.position.primary} / {projection.currentAge}yo
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Overall</span>
              <p className="font-semibold">
                {projection.currentOverall.toFixed(1)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Market Value</span>
              <p className="font-semibold">
                {formatDollars(projection.currentMarketValue)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Current AAV</span>
              <p className="font-semibold">
                {formatDollars(player.contract.aav)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Est. Demand</span>
              <p className="font-semibold">
                {formatDollars(projection.currentDemand)}
              </p>
            </div>
          </div>

          {/* Projection Table */}
          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 text-center w-12">Year</TableHead>
                  <TableHead className="px-2 text-center w-12">Age</TableHead>
                  <TableHead className="px-2 text-right">Proj. OVR</TableHead>
                  <TableHead className="px-2 text-right">Proj. Value</TableHead>
                  <TableHead className="px-2 text-right">Proj. Demand</TableHead>
                  <TableHead className="px-2 text-center">Conf.</TableHead>
                  <TableHead className="px-2">Risks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projection.projections.map((yr) => (
                  <TableRow key={yr.yearOffset} className="text-xs">
                    <TableCell className="px-2 text-center font-medium">
                      +{yr.yearOffset}
                    </TableCell>
                    <TableCell className="px-2 text-center">
                      {yr.projectedAge}
                    </TableCell>
                    <TableCell className="px-2 text-right">
                      <span className="font-mono">
                        {yr.projectedOverall.toFixed(1)}
                      </span>{' '}
                      <span className="text-[10px]">
                        ({formatOverallDelta(yr.overallDelta)})
                      </span>
                    </TableCell>
                    <TableCell className="px-2 text-right font-mono">
                      {formatDollars(yr.projectedMarketValue)}
                    </TableCell>
                    <TableCell className="px-2 text-right">
                      <span className="font-mono">
                        {formatDollars(yr.projectedDemand)}
                      </span>{' '}
                      <span className="text-[10px]">
                        ({formatDemandDelta(yr.demandDelta)})
                      </span>
                    </TableCell>
                    <TableCell className="px-2 text-center">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 ${CONFIDENCE_STYLES[yr.confidence]}`}
                      >
                        {yr.confidence}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2">
                      <div className="flex flex-wrap gap-0.5">
                        {yr.riskFlags.map((flag) => (
                          <Badge
                            key={flag}
                            variant="outline"
                            className={`text-[9px] px-1 py-0 ${RISK_LABELS[flag].color}`}
                          >
                            {RISK_LABELS[flag].label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Visual Demand Trajectory */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Demand Trajectory
            </p>
            <div className="space-y-1">
              {/* Current demand bar */}
              <div className="flex items-center gap-2 text-xs">
                <span className="w-12 text-right text-muted-foreground shrink-0">
                  Now
                </span>
                <div className="flex-1 h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{
                      width: `${maxDemand > 0 ? (projection.currentDemand / maxDemand) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-20 text-right font-mono shrink-0">
                  {formatDollars(projection.currentDemand)}
                </span>
              </div>
              {/* Projected demand bars */}
              {projection.projections.map((yr) => {
                const isOptimal =
                  yr.yearOffset === projection.optimalNegotiationYear
                const isWorst =
                  yr.yearOffset === projection.worstNegotiationYear
                let barColor = 'bg-primary/60'
                if (isOptimal) barColor = 'bg-green-500'
                else if (isWorst) barColor = 'bg-red-500'

                return (
                  <div
                    key={yr.yearOffset}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="w-12 text-right text-muted-foreground shrink-0">
                      +{yr.yearOffset}yr
                    </span>
                    <div className="flex-1 h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{
                          width: `${maxDemand > 0 ? (yr.projectedDemand / maxDemand) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-20 text-right font-mono shrink-0">
                      {formatDollars(yr.projectedDemand)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recommendation Card */}
          <Card className="border-primary/30">
            <CardContent className="flex items-start gap-3 py-3">
              <TrajectoryIcon trajectory={projection.trajectory} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{recommendationTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {recommendationDesc}
                </p>
                {optimalProjection && (
                  <p className="text-xs font-medium mt-1">
                    Lowest projected demand: Year +
                    {projection.optimalNegotiationYear} (
                    {formatDollars(optimalProjection.projectedDemand)})
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Aggregated Risk Summary */}
          {allRiskFlags.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">
                Risks:
              </span>
              {[...allRiskFlags].map((flag) => (
                <Badge
                  key={flag}
                  variant="outline"
                  className={`text-[10px] ${RISK_LABELS[flag].color}`}
                >
                  {RISK_LABELS[flag].label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

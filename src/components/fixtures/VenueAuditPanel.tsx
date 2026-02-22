import { useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { VENUES } from '@/data/venues'
import { computeVenueAudit } from '@/engine/venues/venueAudit'
import type { ClubVenueAudit } from '@/engine/venues/venueAudit'
import type { Club } from '@/types/club'

interface VenueAuditPanelProps {
  onClose: () => void
}

export function VenueAuditPanel({ onClose }: VenueAuditPanelProps) {
  const venueState = useGameStore((s) => s.venueState)
  const season = useGameStore((s) => s.season)
  const clubs = useGameStore((s) => s.clubs)
  const rerunVenueAssignment = useGameStore((s) => s.rerunVenueAssignment)
  const regenerateVenueAllocations = useGameStore((s) => s.regenerateVenueAllocations)
  const fixVenueConflict = useGameStore((s) => s.fixVenueConflict)

  const [showAllClubs, setShowAllClubs] = useState(false)

  const report = useMemo(() => {
    if (!venueState) return null
    return computeVenueAudit(season, venueState, clubs, VENUES)
  }, [venueState, season, clubs])

  if (!report) return null

  const { clubAudits, roundConflicts, totalViolations, criticalCount } = report
  const clubsWithIssues = clubAudits.filter((a) => a.violations.length > 0)
  const displayedAudits = showAllClubs ? clubAudits : clubsWithIssues

  return (
    <Card className="border-primary/30">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Venue Audit</CardTitle>
            {totalViolations === 0 ? (
              <Badge
                variant="secondary"
                className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Clean
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className={`text-xs ${
                  criticalCount > 0
                    ? 'bg-red-500/10 text-red-600 border-red-500/20'
                    : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                }`}
              >
                {totalViolations} violation{totalViolations !== 1 ? 's' : ''}
                {roundConflicts.length > 0
                  ? ` · ${roundConflicts.length} conflict${roundConflicts.length !== 1 ? 's' : ''}`
                  : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={rerunVenueAssignment}
              className="h-7 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Re-run Assignment
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={regenerateVenueAllocations}
              className="h-7 text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Regenerate All
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Round Conflicts */}
        {roundConflicts.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Round Conflicts
            </p>
            {roundConflicts.map((conflict, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-md bg-red-500/5 border border-red-500/20 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                  <span className="text-xs truncate">{conflict.description}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] shrink-0 border-red-500/30 hover:bg-red-500/10"
                  onClick={() =>
                    fixVenueConflict(conflict.roundIndex, conflict.fixtureIndices[1] ?? conflict.fixtureIndices[0])
                  }
                >
                  Fix
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Club Venue Breakdown */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Club Venue Breakdown
          </p>

          {clubsWithIssues.length === 0 && !showAllClubs ? (
            <div className="flex items-center gap-2 text-xs text-emerald-600 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              No violations — all clubs are within quota.
            </div>
          ) : (
            displayedAudits.map((audit) => (
              <ClubAuditRow key={audit.clubId} audit={audit} clubs={clubs} />
            ))
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground w-full"
            onClick={() => setShowAllClubs((v) => !v)}
          >
            {showAllClubs ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-1" />
                Show issues only
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                Show all {clubAudits.length} clubs
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ClubAuditRow({
  audit,
  clubs,
}: {
  audit: ClubVenueAudit
  clubs: Record<string, Club>
}) {
  const [expanded, setExpanded] = useState(audit.violations.length > 0)
  const club = clubs[audit.clubId]
  const primaryVenue = VENUES[audit.primaryVenueId]
  const secondaryVenue = audit.secondaryVenueId ? VENUES[audit.secondaryVenueId] : null

  const actualAtPrimary = audit.actualByVenueId[audit.primaryVenueId] ?? 0
  const actualAtSecondary = audit.secondaryVenueId
    ? (audit.actualByVenueId[audit.secondaryVenueId] ?? 0)
    : 0

  const hasViolations = audit.violations.length > 0

  return (
    <div
      className={`rounded-md border ${
        hasViolations ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border/50'
      }`}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {hasViolations ? (
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          )}
          <span className="font-medium">{club?.fullName ?? audit.clubId}</span>
          {hasViolations && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1 py-0 bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
            >
              {audit.violations.length}
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1 border-t border-border/30">
          {/* Primary venue row */}
          {primaryVenue && (
            <VenueRow
              label="Primary"
              venueName={primaryVenue.name}
              quota={audit.quotaPrimary}
              actual={actualAtPrimary}
              overQuota={actualAtPrimary > audit.quotaPrimary}
            />
          )}

          {/* Secondary venue row */}
          {secondaryVenue && (
            <VenueRow
              label="Secondary"
              venueName={secondaryVenue.name}
              quota={audit.quotaSecondary}
              actual={actualAtSecondary}
              overQuota={actualAtSecondary > audit.quotaSecondary}
            />
          )}

          {/* Sold game count */}
          {audit.quotaSold > 0 && (
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-muted-foreground">
                Sold ({audit.quotaSold} game{audit.quotaSold !== 1 ? 's' : ''})
              </span>
              <div className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                <span>scheduled</span>
              </div>
            </div>
          )}

          {/* Wrong-venue & missing-allocation violations */}
          {audit.violations
            .filter((v) => v.type === 'wrong-venue' || v.type === 'missing-allocation')
            .map((v, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px] text-red-600 pt-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {v.message}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function VenueRow({
  label,
  venueName,
  quota,
  actual,
  overQuota,
}: {
  label: string
  venueName: string
  quota: number
  actual: number
  overQuota: boolean
}) {
  return (
    <div className="flex items-center justify-between text-[11px] pt-1.5">
      <span className="text-muted-foreground truncate max-w-[140px]">
        {label} ({venueName})
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-muted-foreground">quota {quota}</span>
        <span className={`font-medium ${overQuota ? 'text-yellow-600' : 'text-foreground'}`}>
          actual {actual}
        </span>
        {overQuota ? (
          <AlertTriangle className="h-3 w-3 text-yellow-500" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        )}
      </div>
    </div>
  )
}

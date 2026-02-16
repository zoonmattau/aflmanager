import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, AlertCircle, Info, CheckCircle, ClipboardList } from 'lucide-react'
import {
  computeRecommendations,
  type Recommendation,
  type RecommendationSeverity,
} from '@/engine/dashboard/recommendActions'

// ---------------------------------------------------------------------------
// Severity visuals (matches OffseasonStatusDashboard pattern)
// ---------------------------------------------------------------------------

const SEVERITY_ICON: Record<RecommendationSeverity, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
}

const SEVERITY_COLOR: Record<RecommendationSeverity, string> = {
  critical: 'text-red-500',
  warning: 'text-yellow-500',
  info: 'text-blue-500',
}

const SEVERITY_BG: Record<RecommendationSeverity, string> = {
  critical: 'bg-red-500/10',
  warning: 'bg-yellow-500/10',
  info: '',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecommendedActions() {
  const navigate = useNavigate()

  const phase = useGameStore((s) => s.phase)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)
  const settings = useGameStore((s) => s.settings)
  const currentRound = useGameStore((s) => s.currentRound)
  const season = useGameStore((s) => s.season)
  const selectedLineup = useGameStore((s) => s.selectedLineup)
  const newsLog = useGameStore((s) => s.newsLog)
  const negotiations = useGameStore((s) => s.negotiations)
  const offseasonState = useGameStore((s) => s.offseasonState)

  const recommendations = useMemo(
    () =>
      computeRecommendations({
        phase,
        playerClubId,
        players,
        settings,
        currentRound,
        season,
        selectedLineup,
        newsLog,
        negotiations,
        offseasonState,
      }),
    [phase, playerClubId, players, settings, currentRound, season, selectedLineup, newsLog, negotiations, offseasonState],
  )

  const criticalCount = recommendations.filter((r) => r.severity === 'critical').length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Recommended Actions</CardTitle>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              {criticalCount}
            </Badge>
          )}
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {recommendations.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>All caught up</span>
          </div>
        ) : (
          <div className="space-y-1">
            {recommendations.map((rec) => (
              <RecommendationRow key={rec.id} rec={rec} onClick={() => navigate(rec.linkTo)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RecommendationRow({ rec, onClick }: { rec: Recommendation; onClick: () => void }) {
  const Icon = SEVERITY_ICON[rec.severity]
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-2 w-full text-left rounded-md px-2 py-1.5 hover:bg-muted transition-colors text-sm ${SEVERITY_BG[rec.severity]}`}
    >
      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${SEVERITY_COLOR[rec.severity]}`} />
      <div className="min-w-0">
        <p className="font-medium truncate">{rec.title}</p>
        <p className="text-xs text-muted-foreground truncate">{rec.description}</p>
      </div>
    </button>
  )
}

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { analyzeClubListNeeds } from '@/engine/dashboard/listNeeds'
import { AlertTriangle, Layers } from 'lucide-react'

function severityClasses(severity: 'high' | 'medium' | 'low'): string {
  if (severity === 'high') return 'bg-red-500/15 text-red-600 border-red-500/30'
  if (severity === 'medium') return 'bg-amber-500/15 text-amber-600 border-amber-500/30'
  return 'bg-blue-500/15 text-blue-600 border-blue-500/30'
}

export function ClubListNeedsCard() {
  const navigate = useNavigate()
  const playerClubId = useGameStore((s) => s.playerClubId)
  const players = useGameStore((s) => s.players)

  const report = useMemo(
    () => analyzeClubListNeeds(players, playerClubId),
    [players, playerClubId],
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Club List Needs</CardTitle>
        <Layers className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {report.priorityNeeds.length === 0 ? (
          <div className="text-sm text-muted-foreground">No urgent list weaknesses detected right now.</div>
        ) : (
          report.priorityNeeds.slice(0, 5).map((need) => (
            <div key={need.id} className="rounded-md border p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{need.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Depth {need.depth.toFixed(1)}/{need.targetDepth} · Available now {need.availableNow}
                  </p>
                </div>
                <Badge variant="outline" className={severityClasses(need.severity)}>
                  {need.severity.toUpperCase()}
                </Badge>
              </div>
              <div className="mb-2 space-y-0.5">
                {need.reasons.slice(0, 2).map((reason, idx) => (
                  <div key={`${need.id}-reason-${idx}`} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {need.actions.slice(0, 2).map((action) => (
                  <Button
                    key={`${need.id}-${action.label}`}
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => navigate(action.linkTo)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

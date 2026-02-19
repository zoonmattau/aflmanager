import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { analyzeClubListNeeds } from '@/engine/dashboard/listNeeds'
import { Layers } from 'lucide-react'

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
          report.priorityNeeds.slice(0, 3).map((need) => (
            <div key={need.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{need.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  Depth {need.depth.toFixed(1)}/{need.targetDepth}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${severityClasses(need.severity)}`}>
                  {need.severity.toUpperCase()}
                </Badge>
                {need.actions[0] && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => navigate(need.actions[0].linkTo)}
                  >
                    {need.actions[0].label}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

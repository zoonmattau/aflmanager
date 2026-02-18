import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { compareValues, comparisonClass } from '@/lib/comparisonUtils'
import { getOverallRating, getPlayerStarRating, getPlayerPotentialStarProjection } from '@/engine/player/playerRating'
import type { Player } from '@/types/player'

interface CompareDevelopmentProps {
  playerA: Player
  playerB: Player
}

function devPhase(player: Player): string {
  if (player.age < player.hiddenAttributes.peakAgeStart) return 'Pre-Peak'
  if (player.age <= player.hiddenAttributes.peakAgeEnd) return 'Peak'
  return 'Post-Peak'
}

function devPhaseColor(phase: string): string {
  if (phase === 'Pre-Peak') return 'text-blue-500'
  if (phase === 'Peak') return 'text-green-500'
  return 'text-orange-500'
}

function InfoRow({ label, valueA, valueB }: { label: string; valueA: React.ReactNode; valueB: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-1/3 text-right">{valueA}</div>
      <div className="flex-1 text-center text-xs text-muted-foreground font-medium">{label}</div>
      <div className="w-1/3 text-left">{valueB}</div>
    </div>
  )
}

export function CompareDevelopment({ playerA, playerB }: CompareDevelopmentProps) {
  const overallA = getOverallRating(playerA)
  const overallB = getOverallRating(playerB)
  const starsA = getPlayerStarRating(playerA, overallA)
  const starsB = getPlayerStarRating(playerB, overallB)
  const projA = getPlayerPotentialStarProjection(playerA, { overall: overallA })
  const projB = getPlayerPotentialStarProjection(playerB, { overall: overallB })
  const phaseA = devPhase(playerA)
  const phaseB = devPhase(playerB)

  const projStarsWinner = compareValues(projA.projectedStars, projB.projectedStars)

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Development Outlook</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow
          label="Current Stars"
          valueA={<PlayerStarRating stars={starsA} player={playerA} overall={overallA} className="justify-end" />}
          valueB={<PlayerStarRating stars={starsB} player={playerB} overall={overallB} className="justify-start" />}
        />
        <InfoRow
          label="Projected Stars"
          valueA={
            <PlayerStarRating
              stars={starsA}
              player={playerA}
              overall={overallA}
              showPotentialOverlay
              className="justify-end"
            />
          }
          valueB={
            <PlayerStarRating
              stars={starsB}
              player={playerB}
              overall={overallB}
              showPotentialOverlay
              className="justify-start"
            />
          }
        />
        <InfoRow
          label="Proj. Star Rating"
          valueA={<span className={`font-mono font-bold ${comparisonClass(projStarsWinner, 'a')}`}>{projA.projectedStars.toFixed(1)}</span>}
          valueB={<span className={`font-mono font-bold ${comparisonClass(projStarsWinner, 'b')}`}>{projB.projectedStars.toFixed(1)}</span>}
        />
        <InfoRow
          label="Confidence"
          valueA={<Badge variant="outline" className="text-[10px] capitalize">{projA.confidenceLabel}</Badge>}
          valueB={<Badge variant="outline" className="text-[10px] capitalize">{projB.confidenceLabel}</Badge>}
        />
        <InfoRow
          label="Dev Phase"
          valueA={<span className={`font-medium ${devPhaseColor(phaseA)}`}>{phaseA}</span>}
          valueB={<span className={`font-medium ${devPhaseColor(phaseB)}`}>{phaseB}</span>}
        />
        <InfoRow
          label="Age"
          valueA={<span className="font-mono">{playerA.age}</span>}
          valueB={<span className="font-mono">{playerB.age}</span>}
        />
        <InfoRow
          label="Draft Year"
          valueA={<span className="font-mono">{playerA.draftYear}</span>}
          valueB={<span className="font-mono">{playerB.draftYear}</span>}
        />
        <InfoRow
          label="Draft Pick"
          valueA={<span className="font-mono">{playerA.draftPick != null ? `#${playerA.draftPick}` : '-'}</span>}
          valueB={<span className="font-mono">{playerB.draftPick != null ? `#${playerB.draftPick}` : '-'}</span>}
        />
        <InfoRow
          label="Career Games"
          valueA={<span className="font-mono">{playerA.careerStats.gamesPlayed}</span>}
          valueB={<span className="font-mono">{playerB.careerStats.gamesPlayed}</span>}
        />
      </CardContent>
    </Card>
  )
}

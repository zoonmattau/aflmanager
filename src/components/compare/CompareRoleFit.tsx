import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getPositionBadgeClass } from '@/lib/positionColor'
import { compareValues, comparisonClass } from '@/lib/comparisonUtils'
import { attrColor } from '@/lib/attributeCategories'
import { getPlayerPositionRatings } from '@/engine/player/playerRating'
import { getPlayerEligiblePositionTypes } from '@/engine/player/positionEligibility'
import type { Player, PlayerPositionType } from '@/types/player'

interface CompareRoleFitProps {
  playerA: Player
  playerB: Player
}

const ALL_POSITIONS: PlayerPositionType[] = ['BP', 'FB', 'HBF', 'CHB', 'W', 'IM', 'OM', 'RK', 'HFF', 'CHF', 'FP', 'FF']

function formatRole(role: string): string {
  return role.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function CompareRoleFit({ playerA, playerB }: CompareRoleFitProps) {
  const ratingsA = getPlayerPositionRatings(playerA)
  const ratingsB = getPlayerPositionRatings(playerB)
  const eligibleA = new Set(getPlayerEligiblePositionTypes(playerA))
  const eligibleB = new Set(getPlayerEligiblePositionTypes(playerB))
  const secondaryA = new Set(playerA.position.secondary)
  const secondaryB = new Set(playerB.position.secondary)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Position Ratings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-1">
            <div className="flex text-xs text-muted-foreground font-medium mb-2">
              <span className="w-14 text-right">Rating</span>
              <span className="w-14 text-right">Badge</span>
              <span className="flex-1 text-center">Position</span>
              <span className="w-14 text-left">Badge</span>
              <span className="w-14 text-left">Rating</span>
            </div>
            {ALL_POSITIONS.map((pos) => {
              const rA = ratingsA[pos]
              const rB = ratingsB[pos]
              const winner = compareValues(rA, rB)
              const isPrimA = playerA.position.primary === pos
              const isPrimB = playerB.position.primary === pos
              const isSecA = secondaryA.has(pos)
              const isSecB = secondaryB.has(pos)
              return (
                <div key={pos} className="flex items-center">
                  <span className={`w-14 text-right font-mono font-bold text-xs ${comparisonClass(winner, 'a')} ${attrColor(rA)}`}>{rA}</span>
                  <div className="w-14 flex justify-end pr-1">
                    {isPrimA ? (
                      <Badge variant="outline" className={`text-[9px] px-1 ${getPositionBadgeClass(pos)}`}>PRI</Badge>
                    ) : isSecA ? (
                      <Badge variant="outline" className="text-[9px] px-1">SEC</Badge>
                    ) : eligibleA.has(pos) ? (
                      <span className="text-[9px] text-muted-foreground">elig</span>
                    ) : null}
                  </div>
                  <div className="flex-1 text-center">
                    <Badge variant="outline" className={`text-xs ${getPositionBadgeClass(pos)}`}>{pos}</Badge>
                  </div>
                  <div className="w-14 flex justify-start pl-1">
                    {isPrimB ? (
                      <Badge variant="outline" className={`text-[9px] px-1 ${getPositionBadgeClass(pos)}`}>PRI</Badge>
                    ) : isSecB ? (
                      <Badge variant="outline" className="text-[9px] px-1">SEC</Badge>
                    ) : eligibleB.has(pos) ? (
                      <span className="text-[9px] text-muted-foreground">elig</span>
                    ) : null}
                  </div>
                  <span className={`w-14 text-left font-mono font-bold text-xs ${comparisonClass(winner, 'b')} ${attrColor(rB)}`}>{rB}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Role & Archetype</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-1/3 text-right font-medium">{formatRole(playerA.preferredRole)}</div>
            <div className="flex-1 text-center text-xs text-muted-foreground">Preferred Role</div>
            <div className="w-1/3 text-left font-medium">{formatRole(playerB.preferredRole)}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-1/3 text-right font-medium">{formatRole(playerA.archetype)}</div>
            <div className="flex-1 text-center text-xs text-muted-foreground">Archetype</div>
            <div className="w-1/3 text-left font-medium">{formatRole(playerB.archetype)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

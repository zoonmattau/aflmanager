import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlayerStarRating } from '@/components/player/PlayerStarRating'
import { getPositionBadgeClass } from '@/lib/positionColor'
import { attrColor } from '@/lib/attributeCategories'
import { compareValues, comparisonClass } from '@/lib/comparisonUtils'
import { getOverallRating, getPlayerStarRating, getPlayerTags } from '@/engine/player/playerRating'
import { getPlayerEligiblePositionTypes } from '@/engine/player/positionEligibility'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'

interface CompareOverviewProps {
  playerA: Player
  playerB: Player
  clubs: Record<string, Club>
}

function moraleLabel(morale: number): string {
  if (morale >= 90) return 'Ecstatic'
  if (morale >= 75) return 'Happy'
  if (morale >= 60) return 'Content'
  if (morale >= 45) return 'Unsettled'
  if (morale >= 30) return 'Unhappy'
  return 'Furious'
}

function formatRole(role: string): string {
  return role.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function GaugeRow({ label, valueA, valueB, inverted }: { label: string; valueA: number; valueB: number; inverted?: boolean }) {
  const winner = compareValues(valueA, valueB, inverted)
  const effectiveA = inverted ? 100 - valueA : valueA
  const effectiveB = inverted ? 100 - valueB : valueB
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={`w-10 text-right font-mono font-bold ${comparisonClass(winner, 'a')} ${attrColor(effectiveA)}`}>{valueA}</span>
      <div className="flex-1 text-center text-xs text-muted-foreground">{label}</div>
      <span className={`w-10 text-left font-mono font-bold ${comparisonClass(winner, 'b')} ${attrColor(effectiveB)}`}>{valueB}</span>
    </div>
  )
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

export function CompareOverview({ playerA, playerB, clubs }: CompareOverviewProps) {
  const clubA = clubs[playerA.clubId]
  const clubB = clubs[playerB.clubId]
  const overallA = getOverallRating(playerA)
  const overallB = getOverallRating(playerB)
  const starsA = getPlayerStarRating(playerA, overallA)
  const starsB = getPlayerStarRating(playerB, overallB)
  const tagsA = getPlayerTags(playerA)
  const tagsB = getPlayerTags(playerB)
  const eligibleA = getPlayerEligiblePositionTypes(playerA)
  const eligibleB = getPlayerEligiblePositionTypes(playerB)
  const overallWinner = compareValues(overallA, overallB)

  return (
    <div className="space-y-4">
      {/* Player headers */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { player: playerA, club: clubA, overall: overallA, stars: starsA, tags: tagsA, eligible: eligibleA },
          { player: playerB, club: clubB, overall: overallB, stars: starsB, tags: tagsB, eligible: eligibleB },
        ].map(({ player, club, overall, stars, tags, eligible }, idx) => (
          <Card key={player.id}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                  style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                >
                  {player.jerseyNumber}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{player.firstName} {player.lastName}</p>
                  <p className="text-xs text-muted-foreground">{club?.name}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className={`text-2xl font-bold ${comparisonClass(overallWinner, idx === 0 ? 'a' : 'b')}`}>{overall}</p>
                  <PlayerStarRating stars={stars} player={player} overall={overall} className="justify-end" />
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className={getPositionBadgeClass(player.position.primary)}>
                  {player.position.primary}
                </Badge>
                {eligible.filter((p) => p !== player.position.primary).map((pos) => (
                  <Badge key={pos} variant="outline" className={`text-[10px] ${getPositionBadgeClass(pos)}`}>
                    {pos}
                  </Badge>
                ))}
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <Badge key={tag.key} variant="secondary" className="text-[10px]">{tag.label}</Badge>
                  ))}
                </div>
              )}

              {player.injury ? (
                <Badge variant="outline" className="text-[10px] border-red-500/30 bg-red-500/15 text-red-600">
                  {player.injury.type} ({player.injury.weeksRemaining}w)
                </Badge>
              ) : (player.suspension?.weeksRemaining ?? 0) > 0 ? (
                <Badge variant="outline" className="text-[10px] border-orange-500/30 bg-orange-500/15 text-orange-700">
                  Suspended ({player.suspension?.weeksRemaining ?? 0}w)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] border-green-500/30 bg-green-500/15 text-green-600">
                  Fit
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Side-by-side details */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Bio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <InfoRow label="Age" valueA={playerA.age} valueB={playerB.age} />
          <InfoRow label="Height" valueA={`${playerA.height}cm`} valueB={`${playerB.height}cm`} />
          <InfoRow label="Weight" valueA={`${playerA.weight}kg`} valueB={`${playerB.weight}kg`} />
          <InfoRow label="DOB" valueA={playerA.dateOfBirth} valueB={playerB.dateOfBirth} />
          <InfoRow label="Role" valueA={formatRole(playerA.preferredRole)} valueB={formatRole(playerB.preferredRole)} />
          <InfoRow label="Archetype" valueA={formatRole(playerA.archetype)} valueB={formatRole(playerB.archetype)} />
        </CardContent>
      </Card>

      {/* Status gauges */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Condition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <GaugeRow label="Morale" valueA={playerA.morale} valueB={playerB.morale} />
          <InfoRow label="" valueA={<span className="text-[10px] text-muted-foreground">{moraleLabel(playerA.morale)}</span>} valueB={<span className="text-[10px] text-muted-foreground">{moraleLabel(playerB.morale)}</span>} />
          <GaugeRow label="Fitness" valueA={playerA.fitness} valueB={playerB.fitness} />
          <GaugeRow label="Form" valueA={playerA.form} valueB={playerB.form} />
          <GaugeRow label="Fatigue" valueA={playerA.fatigue} valueB={playerB.fatigue} inverted />
        </CardContent>
      </Card>
    </div>
  )
}

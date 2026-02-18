import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { attrColor } from '@/lib/attributeCategories'
import { compareValues, comparisonClass } from '@/lib/comparisonUtils'
import type { Player } from '@/types/player'

interface CompareContractProps {
  playerA: Player
  playerB: Player
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

export function CompareContract({ playerA, playerB }: CompareContractProps) {
  const cA = playerA.contract
  const cB = playerB.contract
  const yearsWinner = compareValues(cA.yearsRemaining, cB.yearsRemaining)
  const aavWinner = compareValues(cA.aav, cB.aav)
  const durabilityWinner = compareValues(playerA.hiddenAttributes.durability, playerB.hiddenAttributes.durability)
  const injuryWinner = compareValues(playerA.hiddenAttributes.injuryProneness, playerB.hiddenAttributes.injuryProneness, true)

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Contract Comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <InfoRow
          label="Years Remaining"
          valueA={<span className={`font-mono font-bold ${comparisonClass(yearsWinner, 'a')}`}>{cA.yearsRemaining}</span>}
          valueB={<span className={`font-mono font-bold ${comparisonClass(yearsWinner, 'b')}`}>{cB.yearsRemaining}</span>}
        />
        <InfoRow
          label="AAV"
          valueA={<span className={`font-mono font-medium ${comparisonClass(aavWinner, 'a')}`}>${(cA.aav / 1000).toFixed(0)}k</span>}
          valueB={<span className={`font-mono font-medium ${comparisonClass(aavWinner, 'b')}`}>${(cB.aav / 1000).toFixed(0)}k</span>}
        />
        <InfoRow
          label="Year-by-Year"
          valueA={<span className="font-mono text-xs">{cA.yearByYear.map((y) => `$${(y / 1000).toFixed(0)}k`).join(', ')}</span>}
          valueB={<span className="font-mono text-xs">{cB.yearByYear.map((y) => `$${(y / 1000).toFixed(0)}k`).join(', ')}</span>}
        />
        <InfoRow
          label="Contract Tier"
          valueA={<Badge variant="outline" className="text-[10px]">{playerA.contractTier === 'state-league' ? 'State League' : 'AFL-Listed'}</Badge>}
          valueB={<Badge variant="outline" className="text-[10px]">{playerB.contractTier === 'state-league' ? 'State League' : 'AFL-Listed'}</Badge>}
        />
        <InfoRow
          label="FA Status"
          valueA={
            <Badge variant={cA.isRestricted ? 'secondary' : 'outline'} className="text-[10px]">
              {cA.isRestricted ? 'Restricted' : 'Unrestricted'}
            </Badge>
          }
          valueB={
            <Badge variant={cB.isRestricted ? 'secondary' : 'outline'} className="text-[10px]">
              {cB.isRestricted ? 'Restricted' : 'Unrestricted'}
            </Badge>
          }
        />
        <InfoRow
          label="List Status"
          valueA={<Badge variant={playerA.isRookie ? 'secondary' : 'default'} className="text-[10px]">{playerA.isRookie ? 'Rookie' : 'Senior'}</Badge>}
          valueB={<Badge variant={playerB.isRookie ? 'secondary' : 'default'} className="text-[10px]">{playerB.isRookie ? 'Rookie' : 'Senior'}</Badge>}
        />
        <InfoRow
          label="Durability"
          valueA={<span className={`font-mono font-medium ${comparisonClass(durabilityWinner, 'a')} ${attrColor(playerA.hiddenAttributes.durability)}`}>{playerA.hiddenAttributes.durability}</span>}
          valueB={<span className={`font-mono font-medium ${comparisonClass(durabilityWinner, 'b')} ${attrColor(playerB.hiddenAttributes.durability)}`}>{playerB.hiddenAttributes.durability}</span>}
        />
        <InfoRow
          label="Injury Proneness"
          valueA={<span className={`font-mono font-medium ${comparisonClass(injuryWinner, 'a')} ${attrColor(100 - playerA.hiddenAttributes.injuryProneness)}`}>{playerA.hiddenAttributes.injuryProneness}</span>}
          valueB={<span className={`font-mono font-medium ${comparisonClass(injuryWinner, 'b')} ${attrColor(100 - playerB.hiddenAttributes.injuryProneness)}`}>{playerB.hiddenAttributes.injuryProneness}</span>}
        />
        {(cA.clauses?.length || cB.clauses?.length) ? (
          <InfoRow
            label="Clauses"
            valueA={<span className="text-xs">{cA.clauses?.length ? `${cA.clauses.length} (${cA.clauses.map((c) => c.type).join(', ')})` : 'None'}</span>}
            valueB={<span className="text-xs">{cB.clauses?.length ? `${cB.clauses.length} (${cB.clauses.map((c) => c.type).join(', ')})` : 'None'}</span>}
          />
        ) : null}
        {(cA.structure || cB.structure) ? (
          <InfoRow
            label="Structure"
            valueA={<span className="text-xs capitalize">{cA.structure ?? '-'}</span>}
            valueB={<span className="text-xs capitalize">{cB.structure ?? '-'}</span>}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

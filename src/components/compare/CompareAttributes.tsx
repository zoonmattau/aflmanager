import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ATTR_CATEGORIES, attrBgColor, attrColor } from '@/lib/attributeCategories'
import { compareValues, comparisonClass } from '@/lib/comparisonUtils'
import type { Player } from '@/types/player'

interface CompareAttributesProps {
  playerA: Player
  playerB: Player
}

export function CompareAttributes({ playerA, playerB }: CompareAttributesProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ATTR_CATEGORIES.map((cat) => {
        const avgA = Math.round(cat.attrs.reduce((sum, { key }) => sum + playerA.attributes[key], 0) / cat.attrs.length)
        const avgB = Math.round(cat.attrs.reduce((sum, { key }) => sum + playerB.attributes[key], 0) / cat.attrs.length)
        const avgWinner = compareValues(avgA, avgB)
        return (
          <Card key={cat.label}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{cat.label}</CardTitle>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className={`font-bold ${comparisonClass(avgWinner, 'a')} ${attrColor(avgA)}`}>{avgA}</span>
                  <span className="text-muted-foreground">avg</span>
                  <span className={`font-bold ${comparisonClass(avgWinner, 'b')} ${attrColor(avgB)}`}>{avgB}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {cat.attrs.map(({ key, label }) => {
                const valA = playerA.attributes[key]
                const valB = playerB.attributes[key]
                const winner = compareValues(valA, valB)
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    {/* Player A bar (right-aligned) */}
                    <span className={`w-7 text-right text-xs font-mono font-bold ${comparisonClass(winner, 'a')} ${attrColor(valA)}`}>
                      {valA}
                    </span>
                    <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full float-right ${attrBgColor(valA)}`}
                        style={{ width: `${valA}%` }}
                      />
                    </div>

                    {/* Label */}
                    <span className="flex-1 text-center text-[10px] text-muted-foreground truncate">{label}</span>

                    {/* Player B bar (left-aligned) */}
                    <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${attrBgColor(valB)}`}
                        style={{ width: `${valB}%` }}
                      />
                    </div>
                    <span className={`w-7 text-left text-xs font-mono font-bold ${comparisonClass(winner, 'b')} ${attrColor(valB)}`}>
                      {valB}
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

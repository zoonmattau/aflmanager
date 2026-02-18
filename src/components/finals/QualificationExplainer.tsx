import type { QualificationRules } from '@/engine/season/finalsQualification'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface QualificationExplainerProps {
  rules: QualificationRules
}

export function QualificationExplainer({ rules }: QualificationExplainerProps) {
  if (rules.totalQualifying <= 0) return null

  return (
    <Card className="border-zinc-700 bg-zinc-800/40">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-zinc-200">
            Finals Qualification
          </h4>
          <Badge variant="outline" className="text-xs">
            {rules.totalQualifying} teams
          </Badge>
        </div>

        {rules.model === 'single-table' ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">{rules.wildcardRule}</p>
            {rules.hasDoubleChance && (
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500/60" />
                <span className="text-zinc-300">
                  Top 4 receive a double chance (non-elimination first week)
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/50" />
              <span className="text-zinc-300">
                Positions {rules.hasDoubleChance ? '5' : '1'}-{rules.totalQualifying} qualify for finals
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Group breakdown */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-300">
                Auto-Qualifiers by {rules.model === 'conferences' ? 'Conference' : 'Division'}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {rules.groups.map((group) => (
                  <div
                    key={group.groupName}
                    className="flex items-center justify-between rounded border border-zinc-700 px-2.5 py-1.5"
                  >
                    <span className="text-xs font-medium text-zinc-200">
                      {group.groupName}
                    </span>
                    <span className="text-xs text-zinc-400">
                      Top {group.autoSpots} qualify
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Wildcard info */}
            {rules.wildcardSpots > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    WC
                  </Badge>
                  <span className="text-xs font-medium text-amber-400">
                    {rules.wildcardSpots} Wildcard Spot{rules.wildcardSpots > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Awarded to the best remaining team{rules.wildcardSpots > 1 ? 's' : ''} across
                  all {rules.model === 'conferences' ? 'conferences' : 'divisions'} who
                  did not auto-qualify. Tie-broken by ladder points, then percentage, then
                  points for.
                </p>
              </div>
            )}

            {/* Double chance */}
            {rules.hasDoubleChance && (
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500/60" />
                <span className="text-zinc-300">
                  Top 4 overall receive a double chance regardless of group
                </span>
              </div>
            )}

            {/* Summary */}
            <p className="text-[11px] text-zinc-500">{rules.wildcardRule}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

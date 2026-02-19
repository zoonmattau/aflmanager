import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TrendingDown, Clock, Activity, AlertTriangle, Sparkles, Info } from 'lucide-react'
import type { Player } from '@/types/player'
import {
  computeAgeingProfile,
  getDeclineStageLabel,
  getRetirementRiskLabel,
  getAthleticDeclineRiskLabel,
  getInjuryRiskTrendLabel,
  declineStageColor,
  retirementRiskColor,
  injuryRiskTrendColor,
  athleticDeclineRiskColor,
} from '@/engine/players/ageingProfile'

interface RowProps {
  icon: React.ReactNode
  label: string
  value: string
  valueClass?: string
  tooltip?: string
}

function ProfileRow({ icon, label, value, valueClass, tooltip }: RowProps) {
  const content = (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
        {tooltip && <Info className="h-3 w-3 opacity-50" />}
      </span>
      <span className={`font-medium tabular-nums ${valueClass ?? ''}`}>{value}</span>
    </div>
  )
  if (!tooltip) return content
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-default">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-56 text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface Props {
  player: Player
}

export function AgeingProfileCard({ player }: Props) {
  const profile = computeAgeingProfile(player)
  const {
    declineStage,
    peakSeasonsRemaining,
    yearsPostPeak,
    retirementRisk,
    retirementChance,
    projectedRetirementAge,
    athleticDeclineRisk,
    injuryRiskTrend,
  } = profile

  const isPastPeak = declineStage !== 'pre-peak' && declineStage !== 'prime'
  const isPrePeak = declineStage === 'pre-peak'
  const showRetirement = player.age >= 28

  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {isPastPeak
            ? <TrendingDown className="h-4 w-4 text-orange-400" />
            : isPrePeak
              ? <Sparkles className="h-4 w-4 text-blue-400" />
              : <Activity className="h-4 w-4 text-emerald-400" />
          }
          Career Phase
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Career stage */}
        <ProfileRow
          icon={<TrendingDown className="h-3 w-3" />}
          label="Stage"
          value={getDeclineStageLabel(declineStage)}
          valueClass={declineStageColor(declineStage)}
          tooltip={
            isPrePeak
              ? `Still developing toward their peak window (${player.hiddenAttributes.peakAgeStart}–${player.hiddenAttributes.peakAgeEnd}).`
              : declineStage === 'prime'
                ? `Player is within their peak performance window (${player.hiddenAttributes.peakAgeStart}–${player.hiddenAttributes.peakAgeEnd}).`
                : `Player is ${yearsPostPeak} year${yearsPostPeak !== 1 ? 's' : ''} past their peak window end (${player.hiddenAttributes.peakAgeEnd}).`
          }
        />

        {/* Peak window */}
        <ProfileRow
          icon={<Clock className="h-3 w-3" />}
          label="Peak Window"
          value={`Age ${player.hiddenAttributes.peakAgeStart}–${player.hiddenAttributes.peakAgeEnd}`}
          tooltip="The age range when this player performs at their best."
        />

        {/* Peak seasons remaining (only meaningful pre-peak or in prime) */}
        {!isPastPeak && (
          <ProfileRow
            icon={<Sparkles className="h-3 w-3" />}
            label="Peak Seasons"
            value={peakSeasonsRemaining === 0 ? 'Final peak year' : `~${peakSeasonsRemaining} remaining`}
            valueClass={peakSeasonsRemaining <= 1 ? 'text-amber-400' : 'text-emerald-400'}
            tooltip="Estimated number of remaining seasons in this player's prime."
          />
        )}

        {/* Years post-peak (only meaningful for declining players) */}
        {isPastPeak && (
          <ProfileRow
            icon={<TrendingDown className="h-3 w-3" />}
            label="Years in Decline"
            value={`${yearsPostPeak} yr${yearsPostPeak !== 1 ? 's' : ''}`}
            valueClass={yearsPostPeak >= 4 ? 'text-red-400' : 'text-orange-400'}
            tooltip="How many seasons this player has been past their peak."
          />
        )}

        {/* Athletic decline */}
        {isPastPeak && (
          <ProfileRow
            icon={<Activity className="h-3 w-3" />}
            label="Skill Decline"
            value={getAthleticDeclineRiskLabel(athleticDeclineRisk)}
            valueClass={athleticDeclineRiskColor(athleticDeclineRisk)}
            tooltip="Expected rate of attribute loss. Physical attributes (speed, endurance, leap) decline fastest."
          />
        )}

        {/* Injury risk */}
        <ProfileRow
          icon={<AlertTriangle className="h-3 w-3" />}
          label="Injury Risk"
          value={getInjuryRiskTrendLabel(injuryRiskTrend)}
          valueClass={injuryRiskTrendColor(injuryRiskTrend)}
          tooltip="Overall injury risk based on age, injury history, durability, and proneness."
        />

        {/* Retirement risk */}
        {showRetirement && (
          <>
            <div className="border-t border-border/40 pt-1" />
            <ProfileRow
              icon={<Clock className="h-3 w-3" />}
              label="Retirement Risk"
              value={getRetirementRiskLabel(retirementRisk)}
              valueClass={retirementRiskColor(retirementRisk)}
              tooltip={`~${Math.round(retirementChance * 100)}% probability of retiring this offseason based on age, form, and morale.`}
            />
            {projectedRetirementAge <= 40 && (
              <ProfileRow
                icon={<Clock className="h-3 w-3" />}
                label="Est. Retirement"
                value={`~Age ${projectedRetirementAge}`}
                valueClass="text-muted-foreground"
                tooltip="Projected age when career retirement becomes more likely than not (>50% cumulative probability)."
              />
            )}
          </>
        )}

        {/* Informational note for declining players */}
        {isPastPeak && retirementRisk === 'none' && (
          <p className="pt-1 text-[11px] text-muted-foreground">
            Declining but retirement unlikely this offseason.
          </p>
        )}

        {/* Badges for key risks */}
        {(retirementRisk === 'high' || retirementRisk === 'very-high') && (
          <Badge variant="outline" className="mt-1 border-red-500/30 bg-red-500/10 text-[10px] text-red-400">
            Retirement watch
          </Badge>
        )}
        {injuryRiskTrend === 'high' && (
          <Badge variant="outline" className="ml-1 mt-1 border-orange-500/30 bg-orange-500/10 text-[10px] text-orange-400">
            High injury risk
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}

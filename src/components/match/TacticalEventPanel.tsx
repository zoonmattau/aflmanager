import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { TacticalEvent, MidMatchDecision, QuarterInjury, MidMatchAdjustment } from '@/types/matchEvent'
import {
  AlertTriangle,
  Activity,
  Shield,
  Zap,
  UserPlus,
  Target,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react'

interface TacticalEventPanelProps {
  events: TacticalEvent[]
  decisions: MidMatchDecision[]
  injuries: QuarterInjury[]
  adjustmentsMade: MidMatchAdjustment[]
  subAvailable: boolean
  subActivated: boolean
  onDecision: (decision: MidMatchDecision) => void
}

const URGENCY_COLORS = {
  info: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  critical: 'border-red-500/40 bg-red-500/10 text-red-200',
} as const

const URGENCY_BADGE = {
  info: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  warning: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
} as const

export function TacticalEventPanel({
  events,
  decisions,
  injuries,
  adjustmentsMade,
  subActivated,
  onDecision,
}: TacticalEventPanelProps) {
  // Split decisions into categories
  const presets = decisions.filter((d) =>
    d.type === 'protect-lead' || d.type === 'chase-game' || d.type === 'stay-course',
  )
  const tempoOptions = decisions.filter((d) => d.type === 'change-tempo')
  const aggressionOptions = decisions.filter((d) => d.type === 'change-aggression')
  const subOption = decisions.find((d) => d.type === 'activate-sub')
  const tagOptions = decisions.filter((d) => d.type === 'tag-switch')
  const moveOptions = decisions.filter((d) =>
    d.type === 'move-player-forward' || d.type === 'move-player-back',
  )

  // Group move options by player
  const moveByPlayer = new Map<string, { forward?: MidMatchDecision; back?: MidMatchDecision; name: string }>()
  for (const d of moveOptions) {
    const pid = d.params?.movePlayerId ?? ''
    const existing = moveByPlayer.get(pid) ?? { name: d.label.replace(/ Forward$| Back$/, '') }
    if (d.type === 'move-player-forward') existing.forward = d
    else existing.back = d
    moveByPlayer.set(pid, existing)
  }

  // Filter out quarter-break from display events (it's shown in parent)
  const displayEvents = events.filter((e) => e.type !== 'quarter-break')

  return (
    <div className="space-y-4">
      {/* Injury alerts */}
      {injuries.length > 0 && (
        <div className="space-y-2">
          {injuries.map((inj) => (
            <div
              key={`inj-${inj.playerId}-${inj.quarter}`}
              className="flex items-center gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">{inj.playerName}</span> — {inj.injuryType} ({inj.weeksOut}w, {inj.severity})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tactical events */}
      {displayEvents.length > 0 && (
        <div className="space-y-2">
          {displayEvents.map((evt) => (
            <div
              key={evt.id}
              className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${URGENCY_COLORS[evt.urgency]}`}
            >
              <Activity className="h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{evt.title}</span>
                  <Badge className={`text-[10px] ${URGENCY_BADGE[evt.urgency]}`}>{evt.urgency}</Badge>
                </div>
                <div className="text-xs opacity-80">{evt.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick presets */}
      {presets.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Actions</div>
          <div className="flex flex-wrap gap-2">
            {presets.map((d) => (
              <Button
                key={d.id}
                variant={d.type === 'protect-lead' ? 'secondary' : d.type === 'chase-game' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => onDecision(d)}
                className="gap-1"
              >
                {d.type === 'protect-lead' && <Shield className="h-3.5 w-3.5" />}
                {d.type === 'chase-game' && <Zap className="h-3.5 w-3.5" />}
                {d.type === 'stay-course' && <Minus className="h-3.5 w-3.5" />}
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Tempo */}
      {tempoOptions.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo</div>
          <div className="flex flex-wrap gap-2">
            {tempoOptions.map((d) => (
              <Button key={d.id} variant="outline" size="sm" onClick={() => onDecision(d)}>
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Aggression */}
      {aggressionOptions.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aggression</div>
          <div className="flex flex-wrap gap-2">
            {aggressionOptions.map((d) => (
              <Button key={d.id} variant="outline" size="sm" onClick={() => onDecision(d)}>
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Substitute */}
      {subOption && !subActivated && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Substitute</div>
          <Button variant="secondary" size="sm" onClick={() => onDecision(subOption)} className="gap-1">
            <UserPlus className="h-3.5 w-3.5" />
            {subOption.label}
          </Button>
        </div>
      )}

      {/* Tag switch */}
      {tagOptions.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tag Assignment</div>
          <div className="flex flex-wrap gap-2">
            {tagOptions.map((d) => (
              <Button key={d.id} variant="outline" size="sm" onClick={() => onDecision(d)} className="gap-1">
                <Target className="h-3.5 w-3.5" />
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Move players */}
      {moveByPlayer.size > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Move Player</div>
          <div className="space-y-1">
            {[...moveByPlayer.entries()].map(([pid, info]) => (
              <div key={pid} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate font-medium">{info.name}</span>
                {info.forward && (
                  <Button variant="outline" size="sm" onClick={() => onDecision(info.forward!)} className="h-7 gap-1 px-2 text-xs">
                    <ArrowUp className="h-3 w-3" /> Fwd
                  </Button>
                )}
                {info.back && (
                  <Button variant="outline" size="sm" onClick={() => onDecision(info.back!)} className="h-7 gap-1 px-2 text-xs">
                    <ArrowDown className="h-3 w-3" /> Back
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adjustments already made */}
      {adjustmentsMade.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adjustments Made</div>
          <div className="space-y-1">
            {adjustmentsMade.map((adj, i) => (
              <div key={i} className="rounded border border-border/50 px-2 py-1 text-xs text-muted-foreground">
                Q{adj.quarter}: {adj.description}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { Pause, Play, ChevronLast, Turtle, FastForward, StepForward } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type PlaybackSpeed = 'paused' | 'slow' | 'normal' | 'fast'

interface LiveScoreboardProps {
  homeName: string
  awayName: string
  homeAbbr: string
  awayAbbr: string
  homeColor: string
  awayColor: string
  homeScore: number
  awayScore: number
  quarter: number          // 1-4 (current/active quarter)
  minute: number
  speed: PlaybackSpeed
  onSpeedChange: (speed: PlaybackSpeed) => void
  onSkip: () => void
  /** When provided, shows a Step button while paused to advance one tick manually. */
  onStep?: () => void
}

export function LiveScoreboard({
  homeName,
  awayName,
  homeAbbr,
  awayAbbr,
  homeColor,
  awayColor,
  homeScore,
  awayScore,
  quarter,
  minute,
  speed,
  onSpeedChange,
  onSkip,
  onStep,
}: LiveScoreboardProps) {
  const margin = Math.abs(homeScore - awayScore)
  const leadingAbbr = homeScore > awayScore ? homeAbbr : awayScore > homeScore ? awayAbbr : null

  const quarterLabel =
    quarter === 1 ? 'Q1' :
    quarter === 2 ? 'Q2' :
    quarter === 3 ? 'Q3' : 'Q4'

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      {/* Score row */}
      <div className="flex items-center justify-between gap-2">
        {/* Home */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="h-7 w-7 rounded-full flex-shrink-0 border border-white/20"
            style={{ backgroundColor: homeColor }}
          />
          <span className="text-sm font-bold truncate">{homeName}</span>
        </div>

        {/* Score + time */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 text-center">
          <div className="text-2xl font-bold tabular-nums leading-none">
            {homeScore}
            <span className="text-muted-foreground mx-1.5">–</span>
            {awayScore}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">
            {quarterLabel} &middot; {minute}'
          </div>
          {leadingAbbr ? (
            <div className="text-[10px] font-medium" style={{ color: homeScore > awayScore ? homeColor : awayColor }}>
              {leadingAbbr} by {margin}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">All square</div>
          )}
        </div>

        {/* Away */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="text-sm font-bold truncate">{awayName}</span>
          <div
            className="h-7 w-7 rounded-full flex-shrink-0 border border-white/20"
            style={{ backgroundColor: awayColor }}
          />
        </div>
      </div>

      {/* Quarter dots */}
      <div className="flex items-center justify-center gap-1.5">
        {[1, 2, 3, 4].map((q) => (
          <div
            key={q}
            className={[
              'h-2 w-2 rounded-full transition-all',
              q < quarter ? 'bg-primary' :
              q === quarter ? 'bg-primary animate-pulse' :
              'bg-muted',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Speed controls */}
      <div className="flex items-center justify-center gap-1">
        <Button
          variant={speed === 'paused' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => onSpeedChange(speed === 'paused' ? 'normal' : 'paused')}
          title={speed === 'paused' ? 'Resume' : 'Pause'}
        >
          {speed === 'paused' ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {speed === 'paused' ? 'Resume' : 'Pause'}
        </Button>
        {speed === 'paused' && onStep && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={onStep}
            title="Advance one possession"
          >
            <StepForward className="h-3 w-3" />
            Step
          </Button>
        )}
        <Button
          variant={speed === 'slow' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => onSpeedChange('slow')}
          title="Slow"
        >
          <Turtle className="h-3 w-3" />
          Slow
        </Button>
        <Button
          variant={speed === 'normal' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => onSpeedChange('normal')}
          title="Normal"
        >
          <Play className="h-3 w-3" />
          Normal
        </Button>
        <Button
          variant={speed === 'fast' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => onSpeedChange('fast')}
          title="Fast"
        >
          <FastForward className="h-3 w-3" />
          Fast
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={onSkip}
          title="Skip to quarter end"
        >
          <ChevronLast className="h-3 w-3" />
          Skip
        </Button>
      </div>
    </div>
  )
}

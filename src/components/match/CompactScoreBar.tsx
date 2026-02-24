import { Pause, Play, Turtle, FastForward, ChevronLast, StepForward } from 'lucide-react'
import type { PlaybackSpeed } from '@/components/match/LiveScoreboard'

interface CompactScoreBarProps {
  homeAbbr: string
  awayAbbr: string
  homeColor: string
  awayColor: string
  homeScore: number
  awayScore: number
  homeGoals?: number
  homeBehinds?: number
  awayGoals?: number
  awayBehinds?: number
  quarter: number
  minute: number
  speed: PlaybackSpeed
  onSpeedChange: (speed: PlaybackSpeed) => void
  onSkip: () => void
  onStep?: () => void
}

export function CompactScoreBar({
  homeAbbr,
  awayAbbr,
  homeColor,
  awayColor,
  homeScore,
  awayScore,
  homeGoals,
  homeBehinds,
  awayGoals,
  awayBehinds,
  quarter,
  minute,
  speed,
  onSpeedChange,
  onSkip,
  onStep,
}: CompactScoreBarProps) {
  const quarterLabel = `Q${quarter}`

  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm shrink-0">
      {/* Home team */}
      <div className="flex items-center gap-1.5">
        <div
          className="h-4 w-4 rounded-full border border-white/20 shrink-0"
          style={{ backgroundColor: homeColor }}
        />
        <span className="font-bold text-xs">{homeAbbr}</span>
      </div>

      {/* Score — AFL format: G.B.Total */}
      <div className="text-lg font-bold tabular-nums leading-none px-1">
        {homeGoals != null && homeBehinds != null ? (
          <><span className="text-xs font-medium text-muted-foreground">{homeGoals}.{homeBehinds}.</span>{homeScore}</>
        ) : homeScore}
        <span className="text-muted-foreground mx-1">–</span>
        {awayGoals != null && awayBehinds != null ? (
          <><span className="text-xs font-medium text-muted-foreground">{awayGoals}.{awayBehinds}.</span>{awayScore}</>
        ) : awayScore}
      </div>

      {/* Away team */}
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-xs">{awayAbbr}</span>
        <div
          className="h-4 w-4 rounded-full border border-white/20 shrink-0"
          style={{ backgroundColor: awayColor }}
        />
      </div>

      {/* Quarter + time */}
      <div className="text-[11px] text-muted-foreground font-mono ml-1">
        {quarterLabel} {minute}'
      </div>

      {/* Quarter dots */}
      <div className="flex items-center gap-1 ml-1">
        {[1, 2, 3, 4].map((q) => (
          <div
            key={q}
            className={[
              'h-1.5 w-1.5 rounded-full',
              q < quarter ? 'bg-primary' :
              q === quarter ? 'bg-primary animate-pulse' :
              'bg-muted',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Playback controls */}
      <div className="flex items-center gap-0.5">
        <button
          className={[
            'h-6 w-6 flex items-center justify-center rounded transition-colors',
            speed === 'paused' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          ].join(' ')}
          onClick={() => onSpeedChange(speed === 'paused' ? 'normal' : 'paused')}
          title={speed === 'paused' ? 'Resume' : 'Pause'}
        >
          {speed === 'paused' ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        </button>
        {speed === 'paused' && onStep && (
          <button
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={onStep}
            title="Step"
          >
            <StepForward className="h-3 w-3" />
          </button>
        )}
        <button
          className={[
            'h-6 w-6 flex items-center justify-center rounded transition-colors',
            speed === 'slow' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          ].join(' ')}
          onClick={() => onSpeedChange('slow')}
          title="Slow"
        >
          <Turtle className="h-3 w-3" />
        </button>
        <button
          className={[
            'h-6 w-6 flex items-center justify-center rounded transition-colors',
            speed === 'normal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          ].join(' ')}
          onClick={() => onSpeedChange('normal')}
          title="Normal"
        >
          <Play className="h-3 w-3" />
        </button>
        <button
          className={[
            'h-6 w-6 flex items-center justify-center rounded transition-colors',
            speed === 'fast' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          ].join(' ')}
          onClick={() => onSpeedChange('fast')}
          title="Fast"
        >
          <FastForward className="h-3 w-3" />
        </button>
        <button
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={onSkip}
          title="Skip to quarter end"
        >
          <ChevronLast className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

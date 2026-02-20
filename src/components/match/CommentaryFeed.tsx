import { useEffect, useRef } from 'react'
import type { MatchTick } from '@/types/matchTick'

interface CommentaryFeedProps {
  ticks: MatchTick[]
  currentIndex: number  // number of ticks revealed so far
  homeColor: string
  awayColor: string
  homeClubId: string
}

const MAX_VISIBLE = 18

export function CommentaryFeed({
  ticks,
  currentIndex,
  homeColor,
  awayColor,
  homeClubId,
}: CommentaryFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll the feed container to the bottom on each new tick — never touches
  // the page scroll position (unlike scrollIntoView which scrolls the window).
  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [currentIndex])

  const visible = ticks.slice(Math.max(0, currentIndex - MAX_VISIBLE), currentIndex)

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 h-48 flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Waiting for first possession…</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="rounded-lg border bg-muted/20 overflow-y-auto h-48 flex flex-col-reverse px-3 py-2 gap-0.5">
      {[...visible].reverse().map((tick, revIdx) => {
        const isNewest = revIdx === 0
        const isGoal = tick.possessionType === 'goal'
        const isInjury = tick.possessionType === 'injury'
        const color = tick.clubId === homeClubId ? homeColor : awayColor

        return (
          <div
            key={tick.tickIndex}
            className={[
              'text-xs py-0.5 flex items-start gap-2 transition-opacity',
              isNewest ? 'opacity-100' : 'opacity-60',
              isGoal ? 'font-semibold' : '',
              isInjury ? 'text-amber-500' : '',
            ].join(' ')}
          >
            {/* Quarter + minute badge */}
            <span className="shrink-0 text-[10px] font-mono text-muted-foreground w-10 text-right pt-0.5">
              Q{tick.quarter} {tick.minute}'
            </span>

            {/* Colour dot */}
            {isGoal ? (
              <span
                className="shrink-0 mt-0.5 h-2.5 w-2.5 rounded-sm border"
                style={{ backgroundColor: color }}
              />
            ) : (
              <span
                className="shrink-0 mt-1 h-1.5 w-1.5 rounded-full opacity-60"
                style={{ backgroundColor: color }}
              />
            )}

            <span className={isGoal ? 'text-yellow-400' : ''}>{tick.commentary}</span>
          </div>
        )
      })}
    </div>
  )
}

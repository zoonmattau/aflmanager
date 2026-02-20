import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight, Star } from 'lucide-react'
import type { PlayByPlayEvent, PlayByPlayEventType } from '@/types/match'
import type { Player } from '@/types/player'

const TYPE_COLOR: Record<PlayByPlayEventType, string> = {
  goal:             'bg-green-500',
  behind:           'bg-teal-500',
  miss:             'bg-amber-500',
  turnover:         'bg-red-500',
  intercept:        'bg-orange-500',
  'contested-mark': 'bg-blue-500',
  mark:             'bg-blue-400',
  clearance:        'bg-purple-400',
  'free-kick':      'bg-yellow-500',
  tackle:           'bg-slate-400',
  inside50:         'bg-indigo-400',
  'quarter-break':  'bg-muted-foreground',
}

const TYPE_LABEL: Record<PlayByPlayEventType, string> = {
  goal:             'Goal',
  behind:           'Behind',
  miss:             'Miss',
  turnover:         'Turnover',
  intercept:        'Intercept',
  'contested-mark': 'C.Mark',
  mark:             'Mark',
  clearance:        'Clearance',
  'free-kick':      'Free',
  tackle:           'Tackle',
  inside50:         'I.50',
  'quarter-break':  'Break',
}

type EventFilter = 'all' | 'goals' | 'scoring' | 'turnovers' | 'marks' | 'free-kicks' | 'highlights'
type TeamFilter = 'both' | 'home' | 'away'

interface PlayByPlayPanelProps {
  events: PlayByPlayEvent[]
  homeClubId: string
  awayClubId: string
  homeClubName: string
  awayClubName: string
  players: Record<string, Player>
  maxHeight?: string
}

function EventRow({
  event,
  homeClubId,
  awayClubId,
}: {
  event: PlayByPlayEvent
  homeClubId: string
  awayClubId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const isHome = event.clubId === homeClubId
  const isAway = event.clubId === awayClubId
  const dotColor = TYPE_COLOR[event.type] ?? 'bg-muted-foreground'

  return (
    <div
      className={`rounded px-2 py-1.5 text-xs ${event.isHighlight ? 'bg-muted/60' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Type dot */}
        <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />

        {/* Minute badge */}
        <span className="shrink-0 text-[10px] font-mono text-muted-foreground w-6 text-right">
          {event.minute}'
        </span>

        {/* Team accent */}
        <span className={`shrink-0 text-[10px] font-semibold w-10 truncate ${
          isHome ? 'text-primary' : isAway ? 'text-secondary-foreground' : 'text-muted-foreground'
        }`}>
          {isHome ? 'HM' : isAway ? 'AW' : ''}
        </span>

        {/* Type label */}
        <span className="shrink-0 text-[10px] text-muted-foreground w-14">
          {TYPE_LABEL[event.type]}
        </span>

        {/* Commentary */}
        <span className={`flex-1 ${event.isHighlight ? 'font-medium' : 'text-muted-foreground'}`}>
          {event.commentary}
          {event.isHighlight && (
            <Star className="inline ml-1 h-2.5 w-2.5 fill-amber-400 text-amber-400" />
          )}
        </span>

        {/* Expand toggle */}
        {event.detail && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {expanded
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />
            }
          </button>
        )}
      </div>

      {expanded && event.detail && (
        <div className="mt-1 ml-12 text-[10px] text-muted-foreground italic">
          {event.detail}
        </div>
      )}
    </div>
  )
}

export function PlayByPlayPanel({
  events,
  homeClubId,
  awayClubId,
  homeClubName,
  awayClubName,
  maxHeight = 'max-h-96',
}: PlayByPlayPanelProps) {
  const [filter, setFilter] = useState<EventFilter>('all')
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('both')
  const [playerSearch, setPlayerSearch] = useState('')

  const searchLower = playerSearch.toLowerCase()

  const filtered = events.filter((e) => {
    if (e.type === 'quarter-break') return true
    if (teamFilter === 'home' && e.clubId !== homeClubId) return false
    if (teamFilter === 'away' && e.clubId !== awayClubId) return false
    if (playerSearch && !e.commentary.toLowerCase().includes(searchLower)) return false
    if (filter === 'goals') return e.type === 'goal'
    if (filter === 'scoring') return ['goal', 'behind', 'miss'].includes(e.type)
    if (filter === 'turnovers') return e.type === 'turnover' || e.type === 'intercept'
    if (filter === 'marks') return e.type === 'mark' || e.type === 'contested-mark'
    if (filter === 'free-kicks') return e.type === 'free-kick'
    if (filter === 'highlights') return e.isHighlight
    return true
  })

  // Newest first — quarter-break dividers act as section headers
  const reversed = [...filtered].reverse()

  const filterBtns: { key: EventFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'goals', label: 'Goals' },
    { key: 'scoring', label: 'Scoring' },
    { key: 'turnovers', label: 'Turnovers' },
    { key: 'marks', label: 'Marks' },
    { key: 'free-kicks', label: 'Free Kicks' },
    { key: 'highlights', label: 'Highlights' },
  ]

  if (events.length === 0) {
    return (
      <div className="rounded border border-border/50 px-3 py-6 text-center text-xs text-muted-foreground">
        No commentary available.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-1.5">
        {filterBtns.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            className="h-6 px-2 text-[10px]"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Team + search row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(['both', 'home', 'away'] as TeamFilter[]).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={teamFilter === t ? 'secondary' : 'ghost'}
              className="h-6 px-2 text-[10px]"
              onClick={() => setTeamFilter(t)}
            >
              {t === 'both' ? 'Both' : t === 'home' ? homeClubName : awayClubName}
            </Button>
          ))}
        </div>
        <Input
          className="h-6 w-32 text-xs"
          placeholder="Search player…"
          value={playerSearch}
          onChange={(e) => setPlayerSearch(e.target.value)}
        />
        <span className="ml-auto text-[10px] text-muted-foreground">
          {filtered.filter((e) => e.type !== 'quarter-break').length} events
        </span>
      </div>

      {/* Event list */}
      <div className={`${maxHeight} overflow-y-auto rounded border border-border/50`}>
        {reversed.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No events match the current filter.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {reversed.map((event) => {
              if (event.type === 'quarter-break') {
                return (
                  <div
                    key={event.id}
                    className="sticky top-0 z-10 flex items-center gap-2 bg-muted/80 px-3 py-1 backdrop-blur-sm"
                  >
                    <Badge variant="outline" className="text-[10px]">
                      Q{event.quarter}
                    </Badge>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Quarter {event.quarter}
                    </span>
                  </div>
                )
              }
              return (
                <EventRow
                  key={event.id}
                  event={event}
                  homeClubId={homeClubId}
                  awayClubId={awayClubId}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

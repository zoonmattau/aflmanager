import { useMemo, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  getEventDatesInMonth,
  getEventsForDate,
  getUpcomingEvents,
  formatDate,
  addMonths,
  getFirstOfMonth,
  getWeekday,
  getDayOfMonth,
  getMonth,
  getYear,
  getLastOfMonth,
  getMonthName,
} from '@/engine/calendar/calendarEngine'
import type { GameEventType } from '@/types/calendar'

const EVENT_COLORS: Record<GameEventType, string> = {
  match: 'bg-blue-500',
  training: 'bg-green-500',
  'contract-deadline': 'bg-orange-500',
  'trade-deadline': 'bg-purple-500',
  draft: 'bg-yellow-500',
  'preseason-friendly': 'bg-teal-500',
  bye: 'bg-gray-400',
  milestone: 'bg-pink-500',
}

const EVENT_LABELS: Record<GameEventType, string> = {
  match: 'Match',
  training: 'Training',
  'contract-deadline': 'Contract',
  'trade-deadline': 'Trade',
  draft: 'Draft',
  'preseason-friendly': 'Friendly',
  bye: 'Bye',
  milestone: 'Event',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarPage() {
  const calendar = useGameStore((s) => s.calendar)
  const currentDate = calendar.currentDate

  // Month navigation
  const [viewDate, setViewDate] = useState(() => getFirstOfMonth(currentDate))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const viewYear = getYear(viewDate)
  const viewMonth = getMonth(viewDate)

  // Event dots for this month
  const eventDots = useMemo(
    () => getEventDatesInMonth(calendar, viewYear, viewMonth),
    [calendar, viewYear, viewMonth],
  )

  // Events for selected date
  const selectedEvents = useMemo(
    () => (selectedDate ? getEventsForDate(calendar, selectedDate) : []),
    [calendar, selectedDate],
  )

  // Upcoming events
  const upcoming = useMemo(
    () => getUpcomingEvents(calendar, 8),
    [calendar],
  )

  // Calendar grid data
  const calendarGrid = useMemo(() => {
    const firstDay = getFirstOfMonth(viewDate)
    const lastDay = getLastOfMonth(viewDate)
    const startWeekday = getWeekday(firstDay)
    const totalDays = getDayOfMonth(lastDay)

    const cells: (number | null)[] = []
    // Leading empty cells
    for (let i = 0; i < startWeekday; i++) cells.push(null)
    // Day cells
    for (let d = 1; d <= totalDays; d++) cells.push(d)
    // Trailing empty cells to fill last row
    while (cells.length % 7 !== 0) cells.push(null)

    return cells
  }, [viewDate])

  const prevMonth = () => setViewDate(addMonths(viewDate, -1))
  const nextMonth = () => setViewDate(addMonths(viewDate, 1))

  const makeDateStr = (day: number) => {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const currentDay = getMonth(currentDate) === viewMonth && getYear(currentDate) === viewYear
    ? getDayOfMonth(currentDate)
    : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          View upcoming events and the season schedule
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Month View */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base">{getMonthName(viewDate)}</CardTitle>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day names */}
            <div className="grid grid-cols-7 text-center text-xs text-muted-foreground mb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {calendarGrid.map((day, i) => {
                if (day === null) {
                  return <div key={`empty-${i}`} className="h-14 border-t" />
                }

                const dateStr = makeDateStr(day)
                const dots = eventDots.get(day) ?? []
                const isToday = day === currentDay
                const isSelected = dateStr === selectedDate
                const isPast = dateStr < currentDate

                return (
                  <button
                    key={day}
                    className={`h-14 border-t px-1 pt-1 text-left transition-colors hover:bg-accent/50 ${
                      isSelected ? 'bg-accent' : ''
                    } ${isPast ? 'opacity-50' : ''}`}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? 'bg-primary text-primary-foreground rounded-full px-1.5 py-0.5'
                          : ''
                      }`}
                    >
                      {day}
                    </span>
                    {dots.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap">
                        {dots.map((type) => (
                          <div
                            key={type}
                            className={`h-1.5 w-1.5 rounded-full ${EVENT_COLORS[type]}`}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
              {Object.entries(EVENT_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1">
                  <div className={`h-2 w-2 rounded-full ${color}`} />
                  <span>{EVENT_LABELS[type as GameEventType]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Selected date events */}
          {selectedDate && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{formatDate(selectedDate)}</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events on this day.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEvents.map((evt) => (
                      <div key={evt.id} className="flex items-start gap-2">
                        <div className={`h-2 w-2 rounded-full mt-1.5 ${EVENT_COLORS[evt.type]}`} />
                        <div>
                          <p className="text-sm font-medium">{evt.title}</p>
                          {evt.description && (
                            <p className="text-xs text-muted-foreground">{evt.description}</p>
                          )}
                          <Badge
                            variant={evt.resolved ? 'secondary' : 'outline'}
                            className="text-[10px] mt-1"
                          >
                            {evt.resolved ? 'Completed' : 'Upcoming'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Upcoming Events */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Upcoming Events</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming events.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((evt) => (
                    <div key={evt.id} className="flex items-start gap-2">
                      <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${EVENT_COLORS[evt.type]}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{evt.title}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(evt.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, ChevronRight, Zap, Bot, MapPin, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGameStore } from '@/stores/gameStore'
import { useMatchReadyStore } from '@/stores/matchReadyStore'
import type { Club } from '@/types/club'
import type { LadderEntry } from '@/types/season'

export function MatchReadyModal() {
  const navigate = useNavigate()

  const phase = useGameStore((s) => s.phase)
  const currentRound = useGameStore((s) => s.currentRound)
  const currentDate = useGameStore((s) => s.currentDate)
  const calendar = useGameStore((s) => s.calendar)
  const simulation = useGameStore((s) => s.simulation)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const season = useGameStore((s) => s.season)
  const clubs = useGameStore((s) => s.clubs)
  const ladder = useGameStore((s) => s.ladder)
  const simCurrentRound = useGameStore((s) => s.simCurrentRound)
  const simFinalsRound = useGameStore((s) => s.simFinalsRound)

  const { dismissed, setDismissed } = useMatchReadyStore()

  // Reset dismissed on each new round
  useEffect(() => {
    setDismissed(false)
  }, [currentRound, setDismissed])

  const isRegularSeason = phase === 'regular-season'
  const isFinals = phase === 'finals'

  // Is there a pending (unresolved) match calendar event for today or earlier?
  const hasPendingMatchEvent = useMemo(
    () => calendar.events.some((e) => !e.resolved && e.type === 'match' && e.date <= (currentDate ?? '')),
    [calendar.events, currentDate],
  )

  const shouldShow = (isRegularSeason || isFinals) && hasPendingMatchEvent && !simulation.active && !dismissed

  // The user's fixture for this round (regular season only; finals fixture not known until sim runs)
  const userFixture = useMemo(() => {
    if (!playerClubId || !isRegularSeason) return null
    const round = season.rounds[currentRound]
    return round?.fixtures.find((f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId) ?? null
  }, [isRegularSeason, season.rounds, currentRound, playerClubId])

  const ladderMap = useMemo(() => {
    const map = new Map<string, { rank: number; entry: LadderEntry }>()
    ladder.forEach((entry, idx) => map.set(entry.clubId, { rank: idx + 1, entry }))
    return map
  }, [ladder])

  const finalsWeek = isFinals ? season.finalsRounds.length + 1 : null

  if (!shouldShow) return null

  const homeClub = userFixture ? clubs[userFixture.homeClubId] : null
  const awayClub = userFixture ? clubs[userFixture.awayClubId] : null

  const roundLabel = isFinals ? `Finals Week ${finalsWeek}` : `Round ${currentRound + 1}`

  const displayDate = currentDate
    ? new Date(currentDate + 'T00:00:00').toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''

  const handleQuickSim = () => {
    if (isFinals) {
      simFinalsRound()
    } else {
      simCurrentRound()
    }
    navigate('/fixture')
  }

  const handleDelegate = () => {
    if (isFinals) {
      simFinalsRound()
    } else {
      simCurrentRound()
    }
    // Modal self-dismisses because hasPendingMatchEvent becomes false once simulated
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-amber-500" />
            <h2 className="text-xl font-bold">Match Day</h2>
            <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 dark:text-amber-400">
              {roundLabel}
            </Badge>
          </div>
          <Badge variant="secondary">{displayDate}</Badge>
        </div>

        {/* Fixture info strip (regular season only) */}
        {userFixture && homeClub && awayClub && (
          <div className="mb-4 rounded-md border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-4">
              <ClubStrip
                club={homeClub}
                ladderData={ladderMap.get(homeClub.id) ?? null}
                isUser={userFixture.homeClubId === playerClubId}
              />
              <div className="shrink-0 text-sm font-medium text-muted-foreground">vs</div>
              <ClubStrip
                club={awayClub}
                ladderData={ladderMap.get(awayClub.id) ?? null}
                isUser={userFixture.awayClubId === playerClubId}
                reverse
              />
            </div>
            {userFixture.venue && (
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {userFixture.venue}
                {userFixture.matchDay && (
                  <> · {userFixture.matchDay.replace(/-/g, ' ')}</>
                )}
                {userFixture.scheduledTime && <> · {userFixture.scheduledTime}</>}
              </div>
            )}
          </div>
        )}

        {/* Options grid */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <OptionCard
            icon={<Eye className="h-5 w-5 text-primary" />}
            title="Sim Live"
            description="Full interactive match with tactical decisions"
            disabled={!userFixture}
            disabledReason="No user fixture this round"
            onClick={() => {
              navigate('/fixture', { state: { autoMode: 'live' } })
              setDismissed(true)
            }}
          />
          <OptionCard
            icon={<ChevronRight className="h-5 w-5 text-primary" />}
            title="Step Through"
            description="Watch quarter by quarter — no decisions required"
            disabled={!userFixture}
            disabledReason="No user fixture this round"
            onClick={() => {
              navigate('/fixture', { state: { autoMode: 'step' } })
              setDismissed(true)
            }}
          />
          <OptionCard
            icon={<Zap className="h-5 w-5 text-amber-500" />}
            title="Quick Sim + Review"
            description="Simulate instantly, then review the result"
            onClick={handleQuickSim}
          />
          <OptionCard
            icon={<Bot className="h-5 w-5 text-muted-foreground" />}
            title="Delegate to Assistant"
            description="Let the assistant handle it automatically"
            onClick={handleDelegate}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
            Prepare First
          </Button>
        </div>
      </div>
    </div>
  )
}

function ClubStrip({
  club,
  ladderData,
  isUser,
  reverse = false,
}: {
  club: Club
  ladderData: { rank: number; entry: LadderEntry } | null
  isUser: boolean
  reverse?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 ${reverse ? 'flex-row-reverse text-right' : ''}`}>
      <div
        className="h-12 w-12 shrink-0 rounded-full border border-white/20 shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${club.colors.primary} 50%, ${club.colors.secondary} 50%)`,
        }}
      />
      <div>
        <div className="font-semibold text-sm">{club.name}</div>
        {ladderData && (
          <div className="text-xs text-muted-foreground">
            #{ladderData.rank} · {ladderData.entry.wins}W {ladderData.entry.draws}D {ladderData.entry.losses}L
          </div>
        )}
        {isUser && (
          <Badge variant="outline" className="mt-1 h-4 text-[10px] px-1">
            Your Club
          </Badge>
        )}
      </div>
    </div>
  )
}

function OptionCard({
  icon,
  title,
  description,
  onClick,
  disabled = false,
  disabledReason,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
  disabledReason?: string
}) {
  if (disabled) {
    return (
      <div className="cursor-not-allowed rounded-lg border border-border p-4 opacity-40">
        <div className="mb-1.5 flex items-center gap-2">
          {icon}
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground">{disabledReason ?? description}</p>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
    >
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  )
}

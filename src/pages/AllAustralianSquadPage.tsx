import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Star, ArrowLeft, Trophy } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { getOverallRating } from '@/engine/player/playerRating'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AAPositionGroup, AllAustralianNomination } from '@/types/allAustralian'

// ── Constants ──────────────────────────────────────────────────────────────

const GROUP_ORDER: AAPositionGroup[] = ['DEF', 'MID', 'RUC', 'FWD']

const GROUP_LABELS: Record<AAPositionGroup, string> = {
  DEF: 'Defenders',
  MID: 'Midfielders',
  RUC: 'Ruck',
  FWD: 'Forwards',
}

const GROUP_COLORS: Record<AAPositionGroup, string> = {
  DEF: 'text-blue-400',
  MID: 'text-emerald-400',
  RUC: 'text-purple-400',
  FWD: 'text-red-400',
}

const GROUP_BADGE: Record<AAPositionGroup, string> = {
  DEF: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  MID: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  RUC: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  FWD: 'bg-red-500/15 text-red-300 border-red-500/30',
}

const GROUP_BORDER: Record<AAPositionGroup, string> = {
  DEF: 'border-blue-500/20',
  MID: 'border-emerald-500/20',
  RUC: 'border-purple-500/20',
  FWD: 'border-red-500/20',
}

const GROUP_QUOTA: Record<AAPositionGroup, number> = {
  DEF: 12,
  MID: 14,
  RUC: 4,
  FWD: 10,
}

// ── Sub-components ────────────────────────────────────────────────────────

function ClubDot({ clubId }: { clubId: string }) {
  const club = useGameStore((s) => s.clubs[clubId])
  if (!club) return null
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full border border-white/10 shrink-0"
      style={{ backgroundColor: club.colors.primary }}
    />
  )
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs font-semibold tabular-nums text-white">{value}</span>
      <span className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</span>
    </div>
  )
}

function NomineeCard({
  nomination,
  rank,
  isUserPlayer,
}: {
  nomination: AllAustralianNomination
  rank: number
  isUserPlayer: boolean
}) {
  const navigate = useNavigate()
  const player = useGameStore((s) => s.players[nomination.playerId])
  const overall = player ? getOverallRating(player) : nomination.overallRating
  const group = nomination.positionGroup

  // Key stats per group
  const keyStats = useMemo((): { label: string; value: string | number }[] => {
    switch (group) {
      case 'DEF':
        return [
          { label: 'Disp', value: nomination.avgDisposals.toFixed(1) },
          { label: 'Intc', value: nomination.avgIntercepts.toFixed(1) },
          { label: 'R50', value: nomination.avgRebound50s.toFixed(1) },
          { label: 'Marks', value: nomination.avgMarks.toFixed(1) },
        ]
      case 'MID':
        return [
          { label: 'Disp', value: nomination.avgDisposals.toFixed(1) },
          { label: 'Clear', value: nomination.avgClearances.toFixed(1) },
          { label: 'Cont', value: nomination.avgContested.toFixed(1) },
          { label: 'Tackles', value: nomination.avgTackles.toFixed(1) },
        ]
      case 'RUC':
        return [
          { label: 'HO', value: nomination.avgHitouts.toFixed(1) },
          { label: 'Clear', value: nomination.avgClearances.toFixed(1) },
          { label: 'Disp', value: nomination.avgDisposals.toFixed(1) },
          { label: 'Cont', value: nomination.avgContested.toFixed(1) },
        ]
      case 'FWD':
        return [
          { label: 'Goals', value: nomination.avgGoals.toFixed(1) },
          { label: 'Disp', value: nomination.avgDisposals.toFixed(1) },
          { label: 'Marks', value: nomination.avgMarks.toFixed(1) },
          { label: 'i50', value: nomination.avgInsideFifties.toFixed(1) },
        ]
    }
  }, [group, nomination])

  return (
    <div
      className={cn(
        'rounded-lg border p-3 cursor-pointer transition-colors hover:bg-zinc-800/60',
        isUserPlayer
          ? 'border-amber-400/50 bg-gradient-to-br from-amber-950/30 to-zinc-900/50 ring-1 ring-amber-400/25'
          : `${GROUP_BORDER[group]} bg-zinc-900/40`,
      )}
      onClick={() => navigate(`/players/${nomination.playerId}`)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] text-zinc-600 font-mono tabular-nums">#{rank}</span>
            <ClubDot clubId={nomination.clubId} />
            {isUserPlayer && <Star className="h-3 w-3 text-amber-400 fill-amber-400" />}
          </div>
          <p className={cn('text-sm font-bold leading-tight', isUserPlayer ? 'text-amber-300' : 'text-white')}>
            {nomination.playerName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge className={cn('text-[9px] px-1.5 py-0', GROUP_BADGE[group])}>
              {nomination.primaryPosition}
            </Badge>
            <span className="text-[10px] text-zinc-500">{nomination.gamesPlayed} gm</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-xl font-bold tabular-nums', GROUP_COLORS[group])}>{overall}</p>
          <p className="text-[10px] text-zinc-500">OVR</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1 pt-2 border-t border-white/5">
        {keyStats.map((s) => (
          <StatPill key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function AllAustralianSquadPage() {
  const navigate = useNavigate()
  const allAustralian = useGameStore((s) => s.allAustralian)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentYear = useGameStore((s) => s.currentYear)
  const phase = useGameStore((s) => s.phase)

  const byGroup = useMemo(() => {
    if (!allAustralian) return {} as Record<AAPositionGroup, AllAustralianNomination[]>
    const grouped: Record<AAPositionGroup, AllAustralianNomination[]> = {
      DEF: [], MID: [], RUC: [], FWD: [],
    }
    for (const n of allAustralian.squad) {
      grouped[n.positionGroup].push(n)
    }
    return grouped
  }, [allAustralian])

  const teamSelected = Boolean(allAustralian?.team && allAustralian.team.length > 0)

  if (!allAustralian || allAustralian.squad.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-zinc-950 text-white">
        <div className="text-center space-y-4">
          <Users className="mx-auto h-12 w-12 text-zinc-700" />
          <p className="text-zinc-400">
            {phase === 'regular-season'
              ? 'The All-Australian squad will be announced at the end of the home-and-away season.'
              : 'No All-Australian squad data available.'}
          </p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-emerald-950/15 to-zinc-950">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-900/40 p-2.5 ring-1 ring-emerald-500/30">
                <Users className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{currentYear} All-Australian Squad</h1>
                <p className="text-sm text-zinc-400">
                  40-man squad · announced after Round {allAustralian.squadAnnouncedRound}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {teamSelected && (
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={() => navigate('/all-australian-night')}
                >
                  <Trophy className="mr-2 h-4 w-4" />
                  View Final 22
                </Button>
              )}
              <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => navigate(-1)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
            </div>
          </div>

          {/* Summary chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {GROUP_ORDER.map((group) => (
              <div
                key={group}
                className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1', GROUP_BADGE[group])}
              >
                <span className="text-xs font-semibold">{GROUP_LABELS[group]}</span>
                <span className="text-xs opacity-70">{byGroup[group]?.length ?? 0}/{GROUP_QUOTA[group]}</span>
              </div>
            ))}
            {teamSelected && (
              <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1">
                <Trophy className="h-3 w-3 text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">Final 22 named</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-8">
        {GROUP_ORDER.map((group) => {
          const nominees = byGroup[group] ?? []
          if (nominees.length === 0) return null
          return (
            <div key={group}>
              <Card className="border-zinc-800 bg-zinc-900/30">
                <CardHeader className="pb-3">
                  <CardTitle className={cn('flex items-center gap-2 text-base', GROUP_COLORS[group])}>
                    <span>{GROUP_LABELS[group]}</span>
                    <Badge className={cn('text-xs font-normal', GROUP_BADGE[group])}>
                      {nominees.length} nominated
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {nominees.map((nomination, idx) => (
                      <NomineeCard
                        key={nomination.playerId}
                        nomination={nomination}
                        rank={idx + 1}
                        isUserPlayer={nomination.clubId === playerClubId}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}

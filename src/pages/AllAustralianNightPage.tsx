import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Trophy, Star, ChevronRight, ChevronsRight, ArrowLeft, Users, Award,
} from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { scoreAllAustralianCandidates } from '@/engine/awards/awardsEngine'
import { getOverallRating } from '@/engine/player/playerRating'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Position slot definitions
// ---------------------------------------------------------------------------

type PositionGroup = 'DEF' | 'MID' | 'FWD' | 'RUC' | 'INT'

interface PositionSlot {
  group: PositionGroup
  label: string
  /** primary positions that map into this slot */
  positions: string[]
}

// Position slot order for the reveal (defenders → mids → forwards → ruck → interchange)
const POSITION_SLOTS: PositionSlot[] = [
  { group: 'DEF', label: 'Back Pocket',         positions: ['BP'] },
  { group: 'DEF', label: 'Back Pocket',         positions: ['BP'] },
  { group: 'DEF', label: 'Half Back Flank',     positions: ['HBF'] },
  { group: 'DEF', label: 'Half Back Flank',     positions: ['HBF'] },
  { group: 'DEF', label: 'Centre Half Back',    positions: ['CHB'] },
  { group: 'DEF', label: 'Full Back',           positions: ['FB'] },
  { group: 'MID', label: 'Wing',                positions: ['W'] },
  { group: 'MID', label: 'Wing',                positions: ['W'] },
  { group: 'MID', label: 'Inside Midfield',     positions: ['IM'] },
  { group: 'MID', label: 'Inside Midfield',     positions: ['IM'] },
  { group: 'MID', label: 'Outside Midfield',    positions: ['OM'] },
  { group: 'MID', label: 'Outside Midfield',    positions: ['OM'] },
  { group: 'MID', label: 'Centre',              positions: [] }, // best available mid
  { group: 'MID', label: 'Centre',              positions: [] },
  { group: 'FWD', label: 'Forward Pocket',      positions: ['FP'] },
  { group: 'FWD', label: 'Forward Pocket',      positions: ['FP'] },
  { group: 'FWD', label: 'Half Forward',        positions: ['HFF'] },
  { group: 'FWD', label: 'Half Forward',        positions: ['HFF'] },
  { group: 'FWD', label: 'Centre Half Forward', positions: ['CHF'] },
  { group: 'FWD', label: 'Full Forward',        positions: ['FF'] },
  { group: 'RUC', label: 'Ruck',               positions: ['RK'] },
  { group: 'INT', label: 'Interchange',         positions: [] },
]

const GROUP_LABELS: Record<PositionGroup, string> = {
  DEF: 'Defenders',
  MID: 'Midfielders',
  FWD: 'Forwards',
  RUC: 'Ruck',
  INT: 'Interchange',
}

const GROUP_COLORS: Record<PositionGroup, string> = {
  DEF: 'text-blue-400',
  MID: 'text-emerald-400',
  FWD: 'text-red-400',
  RUC: 'text-purple-400',
  INT: 'text-amber-400',
}

const GROUP_BORDER: Record<PositionGroup, string> = {
  DEF: 'border-blue-500/30',
  MID: 'border-emerald-500/30',
  FWD: 'border-red-500/30',
  RUC: 'border-purple-500/30',
  INT: 'border-amber-500/30',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assign the 22 selected player IDs to position slots in reveal order.
 * Best-fit: fill specific position slots first, then fill Centre/INT with leftovers.
 */
function assignSlotsToPlayers(
  selectedIds: string[],
  players: Record<string, import('@/types/player').Player>,
): string[] {
  const assigned: string[] = new Array(22).fill('')
  const used = new Set<string>()

  // Candidate buckets by primary position
  const byPos: Record<string, string[]> = {}
  for (const id of selectedIds) {
    const pos = players[id]?.position.primary ?? 'IM'
    ;(byPos[pos] ??= []).push(id)
  }

  // Pass 1: fill specific position slots
  for (let i = 0; i < POSITION_SLOTS.length; i++) {
    const slot = POSITION_SLOTS[i]
    if (slot.positions.length === 0) continue // Centre or INT - handled later
    for (const posCode of slot.positions) {
      const bucket = byPos[posCode] ?? []
      const candidate = bucket.find((id) => !used.has(id))
      if (candidate) {
        assigned[i] = candidate
        used.add(candidate)
        break
      }
    }
  }

  // Pass 2: fill Centre/INT slots with best remaining players (in selectedIds order by score)
  for (let i = 0; i < POSITION_SLOTS.length; i++) {
    if (assigned[i] !== '') continue
    const remaining = selectedIds.filter((id) => !used.has(id))
    if (remaining.length === 0) break
    assigned[i] = remaining[0]
    used.add(remaining[0])
  }

  return assigned
}

// ---------------------------------------------------------------------------
// Stat display helpers
// ---------------------------------------------------------------------------

function statLine(player: import('@/types/player').Player): string {
  const gp = player.seasonStats.gamesPlayed
  if (gp === 0) return 'No games played'
  const disp = (player.seasonStats.disposals / gp).toFixed(1)
  const goals = (player.seasonStats.goals / gp).toFixed(1)
  const marks = (player.seasonStats.marks / gp).toFixed(1)
  const tackles = (player.seasonStats.tackles / gp).toFixed(1)
  return `${disp} disp · ${goals} gl · ${marks} mk · ${tackles} tkl per game`
}

function avgMatchRating(player: import('@/types/player').Player): string {
  const history = player.matchRatingHistory
  if (!history || history.length === 0) {
    return player.lastMatchRating != null ? player.lastMatchRating.toFixed(1) : '—'
  }
  const avg = history.reduce((s, v) => s + v, 0) / history.length
  return avg.toFixed(1)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ClubChip({ clubId }: { clubId: string }) {
  const club = useGameStore((s) => s.clubs[clubId])
  if (!club) return null
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-3 w-3 rounded-full border border-white/20 shrink-0"
        style={{ backgroundColor: club.colors.primary }}
      />
      <span className="text-xs text-zinc-400">{club.fullName}</span>
    </div>
  )
}

function PlayerRevealCard({
  playerId,
  slotLabel,
  group,
  isUserPlayer,
  isNew,
}: {
  playerId: string
  slotLabel: string
  group: PositionGroup
  isUserPlayer: boolean
  isNew: boolean
}) {
  const player = useGameStore((s) => s.players[playerId])
  const overall = player ? getOverallRating(player) : 0

  if (!player) return null

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all duration-500',
        isNew ? 'opacity-100 translate-y-0' : 'opacity-100',
        isUserPlayer
          ? 'border-amber-400/60 bg-gradient-to-br from-amber-950/40 to-zinc-900/60 shadow-amber-500/10 shadow-lg ring-1 ring-amber-400/40'
          : `${GROUP_BORDER[group]} bg-zinc-900/50`,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-0.5">
            {slotLabel}
          </p>
          <p className={cn('text-lg font-bold leading-tight', isUserPlayer ? 'text-amber-300' : 'text-white')}>
            {player.firstName} {player.lastName}
          </p>
          <ClubChip clubId={player.clubId} />
          <p className="mt-1.5 text-[11px] text-zinc-400">{statLine(player)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-2xl font-bold tabular-nums', GROUP_COLORS[group])}>
            {overall}
          </p>
          <p className="text-[10px] text-zinc-500">OVR</p>
          {player.lastMatchRating != null && (
            <>
              <p className="text-sm font-semibold text-zinc-300 tabular-nums mt-1">
                {avgMatchRating(player)}
              </p>
              <p className="text-[10px] text-zinc-500">avg rtg</p>
            </>
          )}
        </div>
      </div>
      {isUserPlayer && isNew && (
        <div className="mt-2 flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-1">
          <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
          <span className="text-xs font-semibold text-amber-400">Your player selected!</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type CeremonyPhase = 'intro' | 'reveal' | 'unlucky' | 'captain' | 'complete'

export function AllAustralianNightPage() {
  const navigate = useNavigate()
  const awards = useGameStore((s) => s.awards)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const ladder = useGameStore((s) => s.ladder)
  const currentYear = useGameStore((s) => s.currentYear)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const allAustralianNightCompleted = useGameStore((s) => s.allAustralianNightCompleted)
  const completeAllAustralianNight = useGameStore((s) => s.completeAllAustralianNight)

  const latestAwards = awards.find((a) => a.year === currentYear) ?? awards[awards.length - 1] ?? null

  // Local state
  const [phase, setPhase] = useState<CeremonyPhase>(() => (allAustralianNightCompleted ? 'complete' : 'intro'))
  // How many of the 22 slots have been revealed (0 = none, 22 = all)
  const [revealedCount, setRevealedCount] = useState(() => (allAustralianNightCompleted ? 22 : 0))
  const [showUnlucky, setShowUnlucky] = useState(() => allAustralianNightCompleted)
  const [showCaptain, setShowCaptain] = useState(() => allAustralianNightCompleted)
  const [newlyRevealedIdx, setNewlyRevealedIdx] = useState<number | null>(null)

  // Clear "newly revealed" after animation
  useEffect(() => {
    if (newlyRevealedIdx == null) return
    const t = setTimeout(() => setNewlyRevealedIdx(null), 800)
    return () => clearTimeout(t)
  }, [newlyRevealedIdx])

  // Derived: 22 player IDs in slot order
  const slotAssignment = useMemo(() => {
    if (!latestAwards || latestAwards.allAustralian.length === 0) return []
    return assignSlotsToPlayers(latestAwards.allAustralian, players)
  }, [latestAwards, players])

  // Runners-up: 5 highest-scoring players not in the AA team
  const runnersUp = useMemo(() => {
    if (!latestAwards) return []
    const selectedSet = new Set(latestAwards.allAustralian)
    return scoreAllAustralianCandidates(players, ladder)
      .filter(({ player }) => !selectedSet.has(player.id))
      .slice(0, 5)
  }, [latestAwards, players, ladder])

  // Captain: highest overall rating among the 22
  const captain = useMemo(() => {
    if (!latestAwards) return null
    let best: { id: string; ovr: number } | null = null
    for (const id of latestAwards.allAustralian) {
      const p = players[id]
      if (!p) continue
      const ovr = getOverallRating(p)
      if (!best || ovr > best.ovr) best = { id, ovr }
    }
    return best ? players[best.id] ?? null : null
  }, [latestAwards, players])

  // Progress bar
  const progressPct = Math.round((revealedCount / 22) * 100)

  // ---- Handlers ----

  const handleRevealNext = () => {
    if (revealedCount >= 22) return
    setNewlyRevealedIdx(revealedCount)
    setRevealedCount((n) => n + 1)
  }

  const handleRevealAll = () => {
    setRevealedCount(22)
    setNewlyRevealedIdx(null)
  }

  const handleFinish = () => {
    completeAllAustralianNight()
    navigate('/')
  }

  // ---- Guard ----
  if (!latestAwards || latestAwards.allAustralian.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-zinc-950 text-white">
        <div className="text-center space-y-4">
          <Trophy className="mx-auto h-12 w-12 text-zinc-600" />
          <p className="text-zinc-400">No All-Australian team has been selected yet.</p>
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>
      </div>
    )
  }

  // ====================================================================
  // INTRO
  // ====================================================================
  if (phase === 'intro') {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-zinc-950 text-white flex items-center justify-center">
        <div className="max-w-lg w-full mx-auto px-4 space-y-6">
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="rounded-full bg-emerald-900/40 p-5 ring-1 ring-emerald-500/30">
                <Users className="h-12 w-12 text-emerald-400" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-emerald-300">
              {currentYear} All-Australian Selection Night
            </h1>
            <p className="text-zinc-400">
              The best 22 players from the {currentYear} AFL season are announced position by position.
            </p>
          </div>

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="py-4 space-y-2">
              {[
                { label: 'Defenders', count: 6, color: 'text-blue-400' },
                { label: 'Midfielders', count: 8, color: 'text-emerald-400' },
                { label: 'Forwards', count: 6, color: 'text-red-400' },
                { label: 'Ruck', count: 1, color: 'text-purple-400' },
                { label: 'Interchange', count: 1, color: 'text-amber-400' },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className={cn('text-sm font-medium', color)}>{label}</span>
                  <span className="text-xs text-zinc-500">{count} player{count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button
            className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
            size="lg"
            onClick={() => setPhase('reveal')}
          >
            Begin Announcement
            <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    )
  }

  // ====================================================================
  // REVEAL
  // ====================================================================

  // Group the revealed players into sections
  const revealedByGroup: Partial<Record<PositionGroup, { playerId: string; slot: PositionSlot; idx: number }[]>> = {}
  for (let i = 0; i < Math.min(revealedCount, slotAssignment.length); i++) {
    const pid = slotAssignment[i]
    const slot = POSITION_SLOTS[i]
    if (!pid || !slot) continue
    ;(revealedByGroup[slot.group] ??= []).push({ playerId: pid, slot, idx: i })
  }

  const allRevealed = revealedCount >= 22
  const captainPlayer = captain

  const renderRevealPhase = () => (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-emerald-950/20 to-zinc-950">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Users className="h-7 w-7 text-emerald-400" />
              <div>
                <h1 className="text-xl font-bold">{currentYear} All-Australian Team</h1>
                <p className="text-sm text-zinc-400">
                  {allRevealed ? '22 of 22 players announced' : `${revealedCount} of 22 revealed`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!allRevealed ? (
                <>
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={handleRevealNext}
                  >
                    <ChevronRight className="mr-1 h-4 w-4" />
                    {revealedCount === 0 ? 'Reveal First' : `Reveal #${revealedCount + 1}`}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    onClick={handleRevealAll}
                  >
                    <ChevronsRight className="mr-1 h-4 w-4" />
                    Fast Forward
                  </Button>
                </>
              ) : !showUnlucky ? (
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={() => setShowUnlucky(true)}
                >
                  Show Unlucky Players
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : !showCaptain ? (
                <Button
                  className="bg-amber-600 text-white hover:bg-amber-500"
                  onClick={() => setShowCaptain(true)}
                >
                  <Award className="mr-1 h-4 w-4" />
                  Captain Announcement
                </Button>
              ) : (
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={handleFinish}
                >
                  <Trophy className="mr-1 h-4 w-4" />
                  Complete Ceremony
                </Button>
              )}
            </div>
          </div>
          {/* Progress */}
          <div className="mt-3 h-1.5 rounded-full bg-zinc-800">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-5xl px-4 py-5 space-y-6">

        {/* Grouped player cards */}
        {(['DEF', 'MID', 'FWD', 'RUC', 'INT'] as PositionGroup[]).map((grp) => {
          const entries = revealedByGroup[grp]
          if (!entries || entries.length === 0) return null
          return (
            <div key={grp}>
              <h3 className={cn('text-sm font-semibold uppercase tracking-widest mb-3', GROUP_COLORS[grp])}>
                {GROUP_LABELS[grp]}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {entries.map(({ playerId, slot, idx }) => {
                  const isUserPlayer = players[playerId]?.clubId === playerClubId
                  return (
                    <PlayerRevealCard
                      key={playerId}
                      playerId={playerId}
                      slotLabel={slot.label}
                      group={grp}
                      isUserPlayer={isUserPlayer}
                      isNew={idx === newlyRevealedIdx}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Unlucky section */}
        {allRevealed && showUnlucky && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest mb-3 text-zinc-500">
              Unlucky — Narrowly Missed Selection
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {runnersUp.map(({ player, score }) => {
                const isUser = player.clubId === playerClubId
                return (
                  <div
                    key={player.id}
                    className={cn(
                      'rounded-lg border border-zinc-700/50 bg-zinc-900/30 p-3',
                      isUser && 'border-amber-600/30 bg-amber-950/10',
                    )}
                  >
                    <p className="text-sm font-semibold text-zinc-300">
                      {player.firstName} {player.lastName}
                    </p>
                    <ClubChip clubId={player.clubId} />
                    <p className="mt-1 text-[10px] text-zinc-500">{statLine(player)}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-600 font-mono">
                      Score: {score.toFixed(1)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Captain announcement */}
        {allRevealed && showCaptain && captainPlayer && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest mb-3 text-amber-400 flex items-center gap-2">
              <Award className="h-4 w-4" />
              All-Australian Captain
            </h3>
            <Card className="border-amber-500/40 bg-gradient-to-br from-amber-950/30 to-zinc-900/60 max-w-sm">
              <CardContent className="py-5 text-center space-y-2">
                <div
                  className="mx-auto h-14 w-14 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg border-2 border-amber-500/40"
                  style={{ backgroundColor: clubs[captainPlayer.clubId]?.colors.primary ?? '#666' }}
                >
                  {captainPlayer.lastName[0]}
                </div>
                <div>
                  <p className="text-xl font-bold text-amber-300">
                    {captainPlayer.firstName} {captainPlayer.lastName}
                  </p>
                  <ClubChip clubId={captainPlayer.clubId} />
                </div>
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">
                  OVR {getOverallRating(captainPlayer)} · Captain
                </Badge>
                {captainPlayer.clubId === playerClubId && (
                  <p className="text-xs font-semibold text-amber-400">
                    ★ Your player is the All-Australian captain!
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state before first reveal */}
        {revealedCount === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <Users className="h-12 w-12 text-zinc-700" />
            <p className="text-zinc-500 text-sm">
              Press "Reveal First" to begin the announcement
            </p>
          </div>
        )}
      </div>
    </div>
  )

  // Render
  return renderRevealPhase()
}

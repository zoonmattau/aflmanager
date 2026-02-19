import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Trophy, Medal, Star, Target, Shield, ChevronRight,
  ChevronsRight, ArrowLeft, Lock,
} from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { getColemanLeaderboard } from '@/engine/awards/awardsEngine'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Phase =
  | 'intro'
  | 'club-bf'
  | 'rising-star'
  | 'coleman'
  | 'all-australian'
  | 'complete'

const PHASE_ORDER: Phase[] = [
  'intro', 'club-bf', 'rising-star', 'coleman', 'all-australian', 'complete',
]

const PHASE_LABELS: Record<Phase, string> = {
  'intro': 'Opening',
  'club-bf': 'Club Best & Fairest',
  'rising-star': 'Rising Star',
  'coleman': 'Coleman Medal',
  'all-australian': 'All-Australian',
  'complete': 'Complete',
}

function getAACategory(pos: string): 'DEF' | 'MID' | 'RUC' | 'FWD' {
  if (['FB', 'CHB', 'BP', 'HBF'].includes(pos)) return 'DEF'
  if (pos === 'RK') return 'RUC'
  if (['CHF', 'FF', 'FP', 'HFF'].includes(pos)) return 'FWD'
  return 'MID'
}

/** Normalise a B&F winner entry from either old (string) or new (ClubBFWinner) format */
function normBF(raw: import('@/types/awards').ClubBFWinner | string) {
  if (typeof raw === 'string') return { winnerId: raw, votes: null as number | null, runnerUpId: null as string | null, runnerUpVotes: null as number | null }
  return { winnerId: raw.winnerId, votes: raw.votes, runnerUpId: raw.runnerUpId, runnerUpVotes: raw.runnerUpVotes }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AwardsNightPage() {
  const navigate = useNavigate()
  const awards = useGameStore((s) => s.awards)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const ladder = useGameStore((s) => s.ladder)
  const currentYear = useGameStore((s) => s.currentYear)
  const awardsNightCompleted = useGameStore((s) => s.awardsNightCompleted)
  const completeAwardsNight = useGameStore((s) => s.completeAwardsNight)

  const latestAwards = awards.find((a) => a.year === currentYear) ?? awards[awards.length - 1] ?? null

  // ---- Local phase state (all initialised to "complete" if already done) ----
  const [phase, setPhase] = useState<Phase>(() => (awardsNightCompleted ? 'complete' : 'intro'))
  const [clubBFStep, setClubBFStep] = useState(() => (awardsNightCompleted ? Infinity : 0))
  const [rsRevealed, setRsRevealed] = useState(() => awardsNightCompleted)
  const [colemanStep, setColemanStep] = useState(() => (awardsNightCompleted ? 5 : 0))
  const [aaRevealed, setAaRevealed] = useState(() => awardsNightCompleted)

  // ---- Derived data ----

  // Club B&F: worst-ranked club reveals first, champion's club last
  const sortedClubBF = useMemo(() => {
    if (!latestAwards) return []
    const entries = Object.entries(latestAwards.clubBestAndFairest)
    return entries.sort((a, b) => {
      const rA = ladder.findIndex((e) => e.clubId === a[0])
      const rB = ladder.findIndex((e) => e.clubId === b[0])
      return (rB === -1 ? -1 : rB) - (rA === -1 ? -1 : rA)
    })
  }, [latestAwards, ladder])

  const totalClubs = sortedClubBF.length
  const revealedCount = Math.min(Math.floor(clubBFStep), totalClubs)
  const currentClub = sortedClubBF[revealedCount - 1] // last revealed [clubId, winner]

  // Coleman top 5 (sorted 1st → 5th)
  const colemanTop5 = useMemo(() => getColemanLeaderboard(players, 5), [players])
  // Visible entries (countdown: 5th first → 1st last)
  const visibleColeman = colemanTop5.slice(Math.max(0, colemanTop5.length - colemanStep))

  // All-Australian by position group
  const aaGrouped = useMemo(() => {
    const groups: Record<string, string[]> = { DEF: [], MID: [], RUC: [], FWD: [] }
    if (!latestAwards) return groups
    for (const pid of latestAwards.allAustralian) {
      const p = players[pid]
      if (!p) continue
      const cat = getAACategory(p.position.primary)
      ;(groups[cat] ??= []).push(pid)
    }
    return groups
  }, [latestAwards, players])

  // ---- Handlers ----

  const handleFinish = () => {
    completeAwardsNight()
    navigate('/')
  }

  // ---- Progress ----
  const phaseIndex = PHASE_ORDER.indexOf(phase)
  const totalPhases = PHASE_ORDER.length - 1 // exclude 'complete'
  const progressPct = Math.round((Math.max(0, phaseIndex - 1) / (totalPhases - 1)) * 100)

  // ---- No awards guard ----
  if (!latestAwards) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-zinc-950 text-white">
        <div className="text-center">
          <Trophy className="mx-auto mb-4 h-12 w-12 text-zinc-600" />
          <p className="text-zinc-400">No awards data available for this season yet.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  // ====================================================================
  // Render
  // ====================================================================
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-950 text-white">
      {/* ── Header ── */}
      <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-amber-950/20 to-zinc-950">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-amber-400" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {currentYear} AFL Awards Night
                </h1>
                <p className="text-sm text-zinc-400">
                  {phase === 'complete' ? 'Ceremony complete' : PHASE_LABELS[phase]}
                </p>
              </div>
            </div>
            {phase !== 'intro' && phase !== 'complete' && (
              <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                {PHASE_LABELS[phase]}
              </Badge>
            )}
          </div>
          {phase !== 'intro' && phase !== 'complete' && (
            <div className="mt-3 h-1 rounded-full bg-zinc-800">
              <div
                className="h-1 rounded-full bg-amber-500 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── LEFT / MAIN ── */}
          <div className="space-y-4 lg:col-span-2">

            {/* ======== INTRO ======== */}
            {phase === 'intro' && (
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardContent className="flex flex-col items-center gap-6 py-12 text-center">
                  <Trophy className="h-16 w-16 text-amber-400" />
                  <div>
                    <h2 className="text-3xl font-bold text-amber-300">
                      Welcome to Awards Night
                    </h2>
                    <p className="mt-2 text-zinc-400">
                      Tonight we celebrate the best players of the {currentYear} season
                    </p>
                  </div>
                  <div className="w-full max-w-sm space-y-2 text-left">
                    {[
                      { icon: Shield, label: 'Club Best & Fairest', sub: `${totalClubs} clubs` },
                      { icon: Star, label: 'Rising Star Award', sub: 'Best first-year player' },
                      { icon: Target, label: 'Coleman Medal', sub: 'Leading goalkicker' },
                      { icon: Shield, label: 'All-Australian Team', sub: '22 players selected' },
                    ].map(({ icon: Icon, label, sub }) => (
                      <div key={label} className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 px-4 py-2.5">
                        <Icon className="h-4 w-4 shrink-0 text-amber-400" />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{label}</p>
                          <p className="text-xs text-zinc-500">{sub}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-3 rounded-md border border-yellow-800/40 bg-yellow-950/20 px-4 py-2.5">
                      <Medal className="h-4 w-4 shrink-0 text-yellow-500" />
                      <div>
                        <p className="text-sm font-medium text-zinc-400">Brownlow Medal</p>
                        <p className="text-xs text-zinc-600">Presented Monday before the Grand Final</p>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="mt-2 bg-amber-600 text-white hover:bg-amber-500"
                    size="lg"
                    onClick={() => setPhase('club-bf')}
                  >
                    Begin Ceremony
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ======== CLUB B&F ======== */}
            {phase === 'club-bf' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-amber-300">Club Best & Fairest</h2>
                    <p className="text-sm text-zinc-400">
                      {revealedCount} of {totalClubs} clubs revealed
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {revealedCount < totalClubs ? (
                      <>
                        <Button
                          className="bg-amber-600 text-white hover:bg-amber-500"
                          onClick={() => setClubBFStep((n) => n + 1)}
                        >
                          <ChevronRight className="mr-1 h-4 w-4" />
                          {revealedCount === 0 ? 'Begin Reveals' : 'Next Club'}
                        </Button>
                        <Button
                          variant="outline"
                          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                          onClick={() => setClubBFStep(totalClubs)}
                        >
                          <ChevronsRight className="mr-1 h-4 w-4" />
                          Reveal All
                        </Button>
                      </>
                    ) : (
                      <Button
                        className="bg-amber-600 text-white hover:bg-amber-500"
                        onClick={() => setPhase('rising-star')}
                      >
                        Continue to Rising Star
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Current reveal spotlight */}
                {currentClub && (() => {
                  const [clubId, rawWinner] = currentClub
                  const bf = normBF(rawWinner)
                  const club = clubs[clubId]
                  const player = players[bf.winnerId]
                  const runnerUp = bf.runnerUpId ? players[bf.runnerUpId] : null
                  const ladderPos = ladder.findIndex((e) => e.clubId === clubId)
                  return (
                    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-zinc-900/50">
                      <CardContent className="flex flex-col items-center gap-4 py-8">
                        <div
                          className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg"
                          style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                        >
                          {club?.abbreviation?.slice(0, 2) ?? '?'}
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-zinc-400 uppercase tracking-widest">
                            {club?.fullName ?? clubId}
                          </p>
                          <p className="mt-1 text-2xl font-bold text-amber-300">
                            {player ? `${player.firstName} ${player.lastName}` : bf.winnerId}
                          </p>
                          {bf.votes != null && (
                            <p className="text-sm text-amber-400 font-medium">{bf.votes} votes</p>
                          )}
                          {player && (
                            <div className="mt-2 flex justify-center gap-4 text-sm text-zinc-400">
                              <span>{player.seasonStats.gamesPlayed} games</span>
                              <span>
                                {player.seasonStats.gamesPlayed > 0
                                  ? (player.seasonStats.disposals / player.seasonStats.gamesPlayed).toFixed(1)
                                  : '—'} disp/g
                              </span>
                              <span>
                                {player.seasonStats.gamesPlayed > 0
                                  ? (player.seasonStats.goals / player.seasonStats.gamesPlayed).toFixed(1)
                                  : '—'} goals/g
                              </span>
                            </div>
                          )}
                          {runnerUp && (
                            <p className="mt-2 text-xs text-zinc-500">
                              Runner-up: {runnerUp.firstName} {runnerUp.lastName}
                              {bf.runnerUpVotes != null ? ` (${bf.runnerUpVotes} votes)` : ''}
                            </p>
                          )}
                          {ladderPos !== -1 && (
                            <p className="mt-1 text-xs text-zinc-500">
                              Ladder position: #{ladderPos + 1}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}

                {revealedCount === 0 && (
                  <Card className="border-zinc-800 bg-zinc-900/50">
                    <CardContent className="flex flex-col items-center gap-3 py-10">
                      <Shield className="h-10 w-10 text-zinc-600" />
                      <p className="text-zinc-400">Press Begin Reveals to start the Club B&F awards</p>
                    </CardContent>
                  </Card>
                )}

                {/* All revealed clubs list */}
                {revealedCount > 0 && (
                  <div className="space-y-1.5">
                    {sortedClubBF.slice(0, revealedCount).map(([clubId, rawWinner], i) => {
                      const bf = normBF(rawWinner)
                      const club = clubs[clubId]
                      const player = players[bf.winnerId]
                      const isCurrent = i === revealedCount - 1
                      return (
                        <div
                          key={clubId}
                          className={`flex items-center gap-3 rounded-md px-3 py-2 ${isCurrent ? 'border border-amber-500/30 bg-amber-950/20' : 'bg-zinc-900/30'}`}
                        >
                          <div
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                          />
                          <span className="text-sm font-medium text-zinc-300 w-32 truncate">
                            {club?.abbreviation ?? clubId}
                          </span>
                          <span className="flex-1 text-sm text-zinc-200">
                            {player ? `${player.firstName} ${player.lastName}` : bf.winnerId}
                          </span>
                          {bf.votes != null && (
                            <span className="text-xs text-amber-400">{bf.votes}v</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ======== RISING STAR ======== */}
            {phase === 'rising-star' && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-amber-300">AFL Rising Star Award</h2>
                <p className="text-sm text-zinc-400">Recognising the best emerging talent of {currentYear}</p>

                {!rsRevealed ? (
                  <Card className="border-zinc-800 bg-zinc-900/50">
                    <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                      <Lock className="h-10 w-10 text-zinc-600" />
                      <p className="text-zinc-300 font-medium">The winner is about to be announced</p>
                      <Button
                        className="bg-amber-600 text-white hover:bg-amber-500"
                        onClick={() => setRsRevealed(true)}
                      >
                        <Star className="mr-2 h-4 w-4" />
                        Reveal Rising Star Winner
                      </Button>
                    </CardContent>
                  </Card>
                ) : latestAwards.risingStar ? (() => {
                  const p = players[latestAwards.risingStar.playerId]
                  const club = p ? clubs[p.clubId] : null
                  return (
                    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-zinc-900/50">
                      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                        <Star className="h-12 w-12 text-amber-400" />
                        <div>
                          <p className="text-sm text-zinc-400 uppercase tracking-widest">
                            {currentYear} AFL Rising Star
                          </p>
                          <h3 className="mt-1 text-3xl font-bold text-amber-300">
                            {p ? `${p.firstName} ${p.lastName}` : latestAwards.risingStar.playerId}
                          </h3>
                          <p className="text-zinc-400">
                            {club?.fullName ?? p?.clubId}
                          </p>
                          {p && (
                            <div className="mt-3 flex justify-center gap-4 text-sm text-zinc-400">
                              <span>Age {p.age}</span>
                              <span>{p.seasonStats.gamesPlayed} games</span>
                              <span>
                                {p.seasonStats.gamesPlayed > 0
                                  ? (p.seasonStats.disposals / p.seasonStats.gamesPlayed).toFixed(1)
                                  : '—'} disp/g
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })() : (
                  <Card className="border-zinc-800 bg-zinc-900/50">
                    <CardContent className="py-8 text-center text-zinc-500">
                      No Rising Star data available.
                    </CardContent>
                  </Card>
                )}

                {rsRevealed && (
                  <Button
                    className="bg-amber-600 text-white hover:bg-amber-500"
                    onClick={() => setPhase('coleman')}
                  >
                    Continue to Coleman Medal
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {/* ======== COLEMAN MEDAL ======== */}
            {phase === 'coleman' && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-amber-300">Coleman Medal</h2>
                <p className="text-sm text-zinc-400">The leading goalkicker of {currentYear}</p>

                {colemanStep === 0 ? (
                  <Card className="border-zinc-800 bg-zinc-900/50">
                    <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                      <Target className="h-10 w-10 text-zinc-600" />
                      <p className="text-zinc-300 font-medium">Counting down the top goalkickers</p>
                      <Button
                        className="bg-amber-600 text-white hover:bg-amber-500"
                        onClick={() => setColemanStep(1)}
                      >
                        Reveal 5th Place
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-zinc-800 bg-zinc-900/50">
                    <CardContent className="space-y-2 p-4">
                      {visibleColeman.map((entry) => {
                        const rank = colemanTop5.indexOf(entry) + 1
                        const p = players[entry.playerId]
                        const club = p ? clubs[p.clubId] : null
                        const isWinner = rank === 1 && colemanStep >= 5
                        return (
                          <div
                            key={entry.playerId}
                            className={`flex items-center gap-3 rounded-md px-4 py-3 transition-colors ${isWinner ? 'border border-amber-500/50 bg-amber-950/30' : 'bg-zinc-900/50'}`}
                          >
                            <span className={`w-8 text-center text-lg font-bold ${isWinner ? 'text-amber-400' : 'text-zinc-500'}`}>
                              #{rank}
                            </span>
                            {club && (
                              <div
                                className="h-3 w-3 shrink-0 rounded-full"
                                style={{ backgroundColor: club.colors.primary }}
                              />
                            )}
                            <div className="flex-1">
                              <p className={`font-medium ${isWinner ? 'text-amber-300' : 'text-zinc-200'}`}>
                                {p ? `${p.firstName} ${p.lastName}` : entry.playerId}
                              </p>
                              <p className="text-xs text-zinc-500">{club?.fullName ?? ''}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-xl font-bold tabular-nums ${isWinner ? 'text-amber-400' : 'text-zinc-300'}`}>
                                {entry.goals}
                              </p>
                              <p className="text-xs text-zinc-500">goals</p>
                            </div>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                )}

                <div className="flex gap-2">
                  {colemanStep < 5 && (
                    <Button
                      className="bg-amber-600 text-white hover:bg-amber-500"
                      onClick={() => setColemanStep((n) => Math.min(n + 1, 5))}
                    >
                      {colemanStep === 0
                        ? 'Reveal 5th Place'
                        : colemanStep < 4
                        ? `Reveal ${['', '', '', '3rd', '2nd', 'Winner'][5 - colemanStep + 1] ?? `${5 - colemanStep}th`} Place`
                        : 'Reveal Coleman Medal Winner'}
                    </Button>
                  )}
                  {colemanStep >= 5 && (
                    <Button
                      className="bg-amber-600 text-white hover:bg-amber-500"
                      onClick={() => setPhase('all-australian')}
                    >
                      Continue to All-Australian
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ======== ALL-AUSTRALIAN ======== */}
            {phase === 'all-australian' && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-amber-300">All-Australian Team</h2>
                <p className="text-sm text-zinc-400">{currentYear} team of the year — 22 players selected</p>

                {!aaRevealed ? (
                  <Card className="border-zinc-800 bg-zinc-900/50">
                    <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                      <Shield className="h-10 w-10 text-zinc-600" />
                      <p className="text-zinc-300 font-medium">The {currentYear} All-Australian squad is ready to be announced</p>
                      <Button
                        className="bg-amber-600 text-white hover:bg-amber-500"
                        onClick={() => setAaRevealed(true)}
                      >
                        <Shield className="mr-2 h-4 w-4" />
                        Reveal All-Australian Team
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {(['DEF', 'MID', 'RUC', 'FWD'] as const).map((cat) => {
                      const catLabels = { DEF: 'Defenders', MID: 'Midfielders', RUC: 'Rucks', FWD: 'Forwards' }
                      const pids = aaGrouped[cat] ?? []
                      if (pids.length === 0) return null
                      return (
                        <Card key={cat} className="border-zinc-800 bg-zinc-900/50">
                          <CardHeader className="py-2 px-4">
                            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                              {catLabels[cat]}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="grid grid-cols-2 gap-1.5 p-3 pt-0 sm:grid-cols-3">
                            {pids.map((pid) => {
                              const p = players[pid]
                              const club = p ? clubs[p.clubId] : null
                              return (
                                <div
                                  key={pid}
                                  className="flex items-center gap-2 rounded px-2 py-1.5 bg-zinc-950/50"
                                >
                                  {club && (
                                    <div
                                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: club.colors.primary }}
                                    />
                                  )}
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium text-zinc-200">
                                      {p ? `${p.firstName} ${p.lastName}` : pid}
                                    </p>
                                    <p className="text-[10px] text-zinc-500">{club?.abbreviation ?? ''}</p>
                                  </div>
                                </div>
                              )
                            })}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}

                {aaRevealed && (
                  <Button
                    className="bg-amber-600 text-white hover:bg-amber-500"
                    onClick={() => setPhase('complete')}
                  >
                    Complete Awards Night
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {/* ======== COMPLETE ======== */}
            {phase === 'complete' && (
              <div className="space-y-4">
                <Card className="border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-zinc-900/50">
                  <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                    <Trophy className="h-14 w-14 text-amber-400" />
                    <h2 className="text-2xl font-bold text-amber-300">
                      {currentYear} Awards Night Complete
                    </h2>
                    <p className="text-zinc-400">All awards have been presented</p>
                  </CardContent>
                </Card>

                {/* Full recap */}
                <div className="space-y-3">
                  {/* Club B&F */}
                  <Card className="border-zinc-800 bg-zinc-900/50">
                    <CardHeader className="py-3">
                      <CardTitle className="flex items-center gap-2 text-sm text-amber-400">
                        <Shield className="h-4 w-4" />
                        Club Best & Fairest Winners
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {sortedClubBF.map(([clubId, rawWinner]) => {
                          const bf = normBF(rawWinner)
                          const club = clubs[clubId]
                          const player = players[bf.winnerId]
                          return (
                            <div key={clubId} className="flex items-center gap-2 rounded px-2 py-1.5 bg-zinc-950/50">
                              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: club?.colors.primary ?? '#666' }} />
                              <span className="text-xs text-zinc-500 w-10 shrink-0">{club?.abbreviation}</span>
                              <span className="flex-1 text-sm text-zinc-200 truncate">
                                {player ? `${player.firstName} ${player.lastName}` : bf.winnerId}
                              </span>
                              {bf.votes != null && <span className="text-xs text-amber-400">{bf.votes}v</span>}
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Individual awards */}
                  {[
                    {
                      icon: Star,
                      label: 'Rising Star',
                      content: (() => {
                        if (!latestAwards.risingStar) return 'N/A'
                        const p = players[latestAwards.risingStar.playerId]
                        const club = p ? clubs[p.clubId] : null
                        return p ? `${p.firstName} ${p.lastName} (${club?.abbreviation ?? ''})` : 'Unknown'
                      })(),
                    },
                    {
                      icon: Target,
                      label: 'Coleman Medal',
                      content: (() => {
                        if (!latestAwards.colemanMedal) return 'N/A'
                        const p = players[latestAwards.colemanMedal.playerId]
                        const club = p ? clubs[p.clubId] : null
                        return p
                          ? `${p.firstName} ${p.lastName} (${club?.abbreviation ?? ''}) — ${latestAwards.colemanMedal.goals} goals`
                          : 'Unknown'
                      })(),
                    },
                    {
                      icon: Shield,
                      label: 'All-Australian',
                      content: `${latestAwards.allAustralian.length} players selected`,
                    },
                    {
                      icon: Medal,
                      label: 'Brownlow Medal',
                      content: (() => {
                        if (!latestAwards.brownlowMedal) return 'N/A'
                        const p = players[latestAwards.brownlowMedal.playerId]
                        const club = p ? clubs[p.clubId] : null
                        return p
                          ? `${p.firstName} ${p.lastName} (${club?.abbreviation ?? ''}) — ${latestAwards.brownlowMedal.votes} votes`
                          : 'Unknown'
                      })(),
                    },
                  ].map(({ icon: Icon, label, content }) => (
                    <div key={label} className="flex items-start gap-3 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-medium text-zinc-200">{content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button
                    className="bg-amber-600 text-white hover:bg-amber-500"
                    onClick={handleFinish}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Return to Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    onClick={() => navigate('/awards-history')}
                  >
                    View Awards History
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT / RECAP SIDEBAR ── */}
          <div>
            <Card className="sticky top-4 border-zinc-800 bg-zinc-900/50">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-zinc-300">Tonight's Awards</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-zinc-800">

                  {/* Club B&F summary */}
                  <div className="px-4 py-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Club B&F ({revealedCount}/{totalClubs})
                    </p>
                    {revealedCount === 0 ? (
                      <p className="text-xs text-zinc-600 italic">Not yet revealed</p>
                    ) : (
                      <div className="space-y-1">
                        {sortedClubBF.slice(0, revealedCount).map(([clubId, rawWinner]) => {
                          const bf = normBF(rawWinner)
                          const club = clubs[clubId]
                          const player = players[bf.winnerId]
                          return (
                            <div key={clubId} className="flex items-center gap-1.5">
                              <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: club?.colors.primary ?? '#666' }} />
                              <span className="text-[11px] text-zinc-500 w-7 shrink-0">{club?.abbreviation}</span>
                              <span className="text-[11px] text-zinc-300 truncate">
                                {player ? `${player.firstName[0]}. ${player.lastName}` : '—'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Rising Star */}
                  <div className="px-4 py-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Rising Star</p>
                    {rsRevealed && latestAwards.risingStar ? (() => {
                      const p = players[latestAwards.risingStar.playerId]
                      return (
                        <div className="flex items-center gap-1.5">
                          <Star className="h-3 w-3 text-amber-400 shrink-0" />
                          <span className="text-xs text-zinc-200">
                            {p ? `${p.firstName} ${p.lastName}` : '—'}
                          </span>
                        </div>
                      )
                    })() : <p className="text-xs text-zinc-600 italic">—</p>}
                  </div>

                  {/* Coleman */}
                  <div className="px-4 py-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Coleman Medal</p>
                    {colemanStep >= 5 && latestAwards.colemanMedal ? (() => {
                      const p = players[latestAwards.colemanMedal.playerId]
                      return (
                        <div className="flex items-center gap-1.5">
                          <Target className="h-3 w-3 text-amber-400 shrink-0" />
                          <span className="text-xs text-zinc-200">
                            {p ? `${p.firstName} ${p.lastName}` : '—'}{' '}
                            <span className="text-zinc-500">({latestAwards.colemanMedal.goals} goals)</span>
                          </span>
                        </div>
                      )
                    })() : <p className="text-xs text-zinc-600 italic">—</p>}
                  </div>

                  {/* All-Australian */}
                  <div className="px-4 py-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">All-Australian</p>
                    {aaRevealed ? (
                      <div className="flex items-center gap-1.5">
                        <Shield className="h-3 w-3 text-amber-400 shrink-0" />
                        <span className="text-xs text-zinc-200">
                          {latestAwards.allAustralian.length} players selected
                        </span>
                      </div>
                    ) : <p className="text-xs text-zinc-600 italic">—</p>}
                  </div>

                  {/* Brownlow (revealed separately on Brownlow Night before GF) */}
                  <div className="px-4 py-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Brownlow Medal</p>
                    {latestAwards?.brownlowMedal ? (() => {
                      const p = players[latestAwards.brownlowMedal.playerId]
                      return (
                        <div className="flex items-center gap-1.5">
                          <Medal className="h-3 w-3 text-yellow-400 shrink-0" />
                          <span className="text-xs text-zinc-200">
                            {p ? `${p.firstName} ${p.lastName}` : '—'}{' '}
                            <span className="text-zinc-500">({latestAwards.brownlowMedal.votes} votes)</span>
                          </span>
                        </div>
                      )
                    })() : (
                      <p className="text-xs text-zinc-600 italic">Presented Monday before the GF</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

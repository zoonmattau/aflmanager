import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { getBrownlowLeaderboard } from '@/engine/awards/awardsEngine'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Medal, ChevronRight, ChevronsRight, ArrowLeft, Trophy } from 'lucide-react'

export function BrownlowNightPage() {
  const brownlowTracker = useGameStore((s) => s.brownlowTracker)
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const currentYear = useGameStore((s) => s.currentYear)
  const revealBrownlow = useGameStore((s) => s.revealBrownlow)
  const navigate = useNavigate()

  // Determine max round from tracker
  const maxRound = useMemo(() => {
    if (brownlowTracker.length === 0) return 0
    return Math.max(...brownlowTracker.map((r) => r.round))
  }, [brownlowTracker])

  const [revealedUpToRound, setRevealedUpToRound] = useState(0)

  const isComplete = revealedUpToRound >= maxRound

  // Compute partial leaderboard from revealed rounds only
  const partialTracker = useMemo(
    () => brownlowTracker.filter((r) => r.round <= revealedUpToRound),
    [brownlowTracker, revealedUpToRound],
  )
  const leaderboard = useMemo(
    () => getBrownlowLeaderboard(partialTracker, 20),
    [partialTracker],
  )

  // Current round's votes for display
  const currentRoundVotes = useMemo(
    () => brownlowTracker.filter((r) => r.round === revealedUpToRound),
    [brownlowTracker, revealedUpToRound],
  )

  // Set of player IDs who gained votes in current round (for highlighting)
  const currentRoundPlayerIds = useMemo(() => {
    const ids = new Set<string>()
    for (const match of currentRoundVotes) {
      for (const v of match.votes) {
        ids.add(v.playerId)
      }
    }
    return ids
  }, [currentRoundVotes])

  const handleNextRound = () => {
    if (revealedUpToRound < maxRound) {
      setRevealedUpToRound((r) => r + 1)
    }
  }

  const handleRevealAll = () => {
    setRevealedUpToRound(maxRound)
  }

  const handleFinish = () => {
    revealBrownlow()
    navigate('/ladder')
  }

  const winner = isComplete && leaderboard.length > 0 ? leaderboard[0] : null
  const winnerPlayer = winner ? players[winner.playerId] : null
  const winnerClub = winnerPlayer ? clubs[winnerPlayer.clubId] : null

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-yellow-950/20 to-zinc-950">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Medal className="h-8 w-8 text-yellow-500" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {currentYear} Brownlow Medal
                </h1>
                <p className="text-sm text-zinc-400">
                  The Charles Brownlow Trophy
                </p>
              </div>
            </div>
            <div className="text-sm text-zinc-400">
              {revealedUpToRound > 0
                ? `Round ${revealedUpToRound} of ${maxRound}`
                : 'Press Next Round to begin'}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-1.5 rounded-full bg-zinc-800">
            <div
              className="h-1.5 rounded-full bg-yellow-500 transition-all duration-500"
              style={{ width: maxRound > 0 ? `${(revealedUpToRound / maxRound) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Winner banner */}
        {isComplete && winner && winnerPlayer && (
          <Card className="mb-6 border-yellow-500/50 bg-gradient-to-r from-yellow-950/30 via-yellow-900/20 to-yellow-950/30">
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <Trophy className="h-12 w-12 text-yellow-500" />
              <h2 className="text-3xl font-bold text-yellow-400">
                {winnerPlayer.firstName} {winnerPlayer.lastName}
              </h2>
              <p className="text-lg text-zinc-300">
                {winnerClub?.fullName ?? winnerPlayer.clubId}
              </p>
              <p className="text-2xl font-bold tabular-nums text-yellow-500">
                {winner.votes} votes
              </p>
              <p className="text-sm text-zinc-400">
                {currentYear} Brownlow Medallist
              </p>
              <Button
                onClick={handleFinish}
                className="mt-4 bg-yellow-600 text-white hover:bg-yellow-500"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to Ladder
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Round-by-round votes */}
          <div className="space-y-4 lg:col-span-2">
            {/* Controls */}
            {!isComplete && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleNextRound}
                  className="bg-yellow-600 text-white hover:bg-yellow-500"
                >
                  <ChevronRight className="mr-1 h-4 w-4" />
                  Next Round
                </Button>
                <Button
                  onClick={handleRevealAll}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <ChevronsRight className="mr-1 h-4 w-4" />
                  Reveal All
                </Button>
              </div>
            )}

            {isComplete && !winner && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleFinish}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Return to Ladder
                </Button>
              </div>
            )}

            {/* Current round votes */}
            {revealedUpToRound > 0 && (
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm text-yellow-400">
                    Round {revealedUpToRound} Votes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-0">
                  {currentRoundVotes.length === 0 ? (
                    <p className="text-sm text-zinc-500">No votes this round.</p>
                  ) : (
                    currentRoundVotes.map((match) => (
                      <div
                        key={match.matchId}
                        className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3"
                      >
                        <div className="space-y-1.5">
                          {match.votes.map((v) => {
                            const p = players[v.playerId]
                            const club = p ? clubs[p.clubId] : null
                            return (
                              <div
                                key={v.playerId}
                                className="flex items-center justify-between text-sm"
                              >
                                <div className="flex items-center gap-2">
                                  {club && (
                                    <div
                                      className="h-3 w-3 rounded-full"
                                      style={{ backgroundColor: club.colors.primary }}
                                    />
                                  )}
                                  <span className="text-zinc-200">
                                    {p ? `${p.firstName} ${p.lastName}` : v.playerId}
                                  </span>
                                  <span className="text-xs text-zinc-500">
                                    {club?.abbreviation ?? ''}
                                  </span>
                                </div>
                                <span className="font-mono font-bold text-yellow-400">
                                  {v.votes}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            {revealedUpToRound === 0 && (
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardContent className="flex flex-col items-center gap-3 py-12">
                  <Medal className="h-12 w-12 text-yellow-500/50" />
                  <p className="text-zinc-400">
                    Press "Next Round" to begin the count
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Live leaderboard */}
          <div>
            <Card className="sticky top-4 border-zinc-800 bg-zinc-900/50">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-zinc-300">
                  Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-zinc-800">
                  {leaderboard.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-zinc-500">
                      No votes revealed yet
                    </div>
                  ) : (
                    leaderboard.map((entry, i) => {
                      const p = players[entry.playerId]
                      const club = p ? clubs[p.clubId] : null
                      const gainedThisRound = currentRoundPlayerIds.has(entry.playerId)
                      return (
                        <div
                          key={entry.playerId}
                          className={`flex items-center gap-3 px-4 py-2 transition-colors ${
                            gainedThisRound ? 'bg-yellow-500/10' : ''
                          } ${i === 0 && isComplete ? 'bg-yellow-500/20' : ''}`}
                        >
                          <span className="w-5 text-right text-xs text-zinc-500">
                            {i + 1}
                          </span>
                          {club && (
                            <div
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: club.colors.primary }}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-sm ${i === 0 && isComplete ? 'font-bold text-yellow-400' : 'text-zinc-200'}`}>
                              {p ? `${p.firstName} ${p.lastName}` : entry.playerId}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {club?.abbreviation ?? ''}
                            </p>
                          </div>
                          <span className={`font-mono text-sm font-bold ${
                            gainedThisRound ? 'text-yellow-400' : 'text-zinc-300'
                          }`}>
                            {entry.votes}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

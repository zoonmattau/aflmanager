/**
 * MatchViewerPage (/watch)
 *
 * Handles watching any AFL game on the calendar — the user's own match,
 * another team's match in spectator mode, or a historical match review.
 *
 * Navigation state (from useLocation().state):
 *   homeClubId, awayClubId, venue, venueId?,
 *   round, fixtureIndex, date, isUserMatch, matchId?
 */

import { useMemo, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { LiveMatchView } from '@/components/match/LiveMatchView'
import { PreGameScreen } from '@/components/matchviewer/PreGameScreen'
import { PastGameViewer } from '@/components/matchviewer/PastGameViewer'
import { selectBestLineup } from '@/engine/ai/lineupSelection'
import { getOverallRating } from '@/engine/player/playerRating'
import { generateMatchWeather } from '@/engine/match/weatherEngine'
import { SeededRNG } from '@/engine/core/rng'
import type { SimulateMatchInput } from '@/engine/match/simulateMatch'
import type { Match } from '@/types/match'
import type { Fixture } from '@/types/season'

// ---------------------------------------------------------------------------
// Nav state type
// ---------------------------------------------------------------------------

export interface WatchNavState {
  homeClubId: string
  awayClubId: string
  venue: string
  venueId?: string
  round: number
  fixtureIndex: number
  date?: string
  isUserMatch: boolean
  /** If set and the match has been played — skip straight to past-game view */
  matchId?: string
}

type Stage = 'pre-game' | 'live' | 'post-game'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function MatchViewerPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state ?? {}) as Partial<WatchNavState>

  const {
    homeClubId  = '',
    awayClubId  = '',
    venue       = '',
    venueId,
    round       = 0,
    fixtureIndex = 0,
    isUserMatch = false,
    matchId,
  } = state

  // Store data
  const clubs         = useGameStore((s) => s.clubs)
  const players       = useGameStore((s) => s.players)
  const settings      = useGameStore((s) => s.settings)
  const rngSeed       = useGameStore((s) => s.rngSeed)
  const playerClubId  = useGameStore((s) => s.playerClubId ?? '')
  const matchResults  = useGameStore((s) => s.matchResults)
  const h2hRecords    = useGameStore((s) => s.history.h2hRecords ?? {})
  const currentRound  = useGameStore((s) => s.currentRound)
  const season        = useGameStore((s) => s.season)
  const selectedLineup       = useGameStore((s) => s.selectedLineup)
  const selectedSubstituteId = useGameStore((s) => s.selectedSubstituteId)
  const weeklyGameplans     = useGameStore((s) => s.weeklyGameplans)
  const simCurrentRound     = useGameStore((s) => s.simCurrentRound)
  const userWeeklyGameplan  = playerClubId ? weeklyGameplans[playerClubId] : undefined

  // Route guard — if no data was passed in, go back
  const hasData = homeClubId && awayClubId

  // Determine past match (already has result)
  const pastMatch = useMemo(() => {
    if (!matchId) return null
    return matchResults.find((m) => m.id === matchId && m.result !== null) ?? null
  }, [matchId, matchResults])

  const isPastGame = Boolean(pastMatch)

  // Stage state
  const [stage, setStage] = useState<Stage>(isPastGame ? 'post-game' : 'pre-game')
  const [completedMatch, setCompletedMatch] = useState<Match | null>(pastMatch)

  // Seed for this fixture
  const seed = useMemo(
    () => rngSeed + round * 100 + fixtureIndex,
    [rngSeed, round, fixtureIndex],
  )

  // Pre-generate weather for pre-game screen
  const weatherData = useMemo(() => {
    if (!hasData) return null
    const rng = new SeededRNG(seed + 8888)
    return generateMatchWeather(rng, venueId)
  }, [hasData, seed, venueId])

  // Build simInput for the match
  const simInput = useMemo<SimulateMatchInput | null>(() => {
    if (!hasData || isPastGame) return null

    const userClub = clubs[playerClubId]
    const userIsHome = playerClubId === homeClubId

    // Lineup for user's team
    let homeLineupPlayerIds: string[] | undefined
    let awayLineupPlayerIds: string[] | undefined
    let homeSubstituteId: string | null = null
    let awaySubstituteId: string | null = null

    if (isUserMatch && selectedLineup) {
      const lineupIds = Object.values(selectedLineup).filter(Boolean) as string[]
      if (userIsHome) {
        homeLineupPlayerIds = lineupIds
        homeSubstituteId    = selectedSubstituteId
      } else {
        awayLineupPlayerIds = lineupIds
        awaySubstituteId    = selectedSubstituteId
      }
    }

    return {
      homeClubId,
      awayClubId,
      venue,
      venueId,
      round,
      players,
      clubs,
      seed,
      matchRules: settings.matchRules,
      realism:    settings.realism,
      injuryFrequency: settings.injuryFrequency,
      homeLineupPlayerIds,
      awayLineupPlayerIds,
      homeSubstituteId,
      awaySubstituteId,
    }
  }, [
    hasData, isPastGame, homeClubId, awayClubId, venue, venueId,
    round, players, clubs, seed, settings,
    playerClubId, isUserMatch, selectedLineup, selectedSubstituteId,
  ])

  // Slot lineups for field view
  const userIsHome = playerClubId === homeClubId
  const homeSlotLineup = useMemo(
    () => (isUserMatch && userIsHome && selectedLineup ? (selectedLineup as Record<string, string>) : undefined),
    [isUserMatch, userIsHome, selectedLineup],
  )
  const awaySlotLineup = useMemo(
    () => (isUserMatch && !userIsHome && selectedLineup ? (selectedLineup as Record<string, string>) : undefined),
    [isUserMatch, userIsHome, selectedLineup],
  )

  // Gameplans for the viewer
  const homeGameplan = (isUserMatch && userIsHome && userWeeklyGameplan?.overrides)
    ? { ...clubs[homeClubId]?.gameplan, ...userWeeklyGameplan.overrides }
    : clubs[homeClubId]?.gameplan ?? null
  const awayGameplan = (isUserMatch && !userIsHome && userWeeklyGameplan?.overrides)
    ? { ...clubs[awayClubId]?.gameplan, ...userWeeklyGameplan.overrides }
    : clubs[awayClubId]?.gameplan ?? null
  const homeMatchupTactics = (isUserMatch && userIsHome)
    ? (userWeeklyGameplan?.matchupTactics ?? null)
    : null

  const handleKickOff = useCallback((_kickingEnd: 'home' | 'away') => {
    setStage('live')
  }, [])

  const handleMatchComplete = useCallback((match: Match) => {
    if (isUserMatch) {
      // Commit the match through the store pipeline; Zustand updates synchronously
      simCurrentRound({ precomputedUserMatch: match })
      // Re-read the stored match so we get the version with prepAnalysis attached
      const updated = useGameStore.getState().matchResults.find((m) => m.id === match.id) ?? match
      setCompletedMatch(updated)
    } else {
      setCompletedMatch(match)
    }
    setStage('post-game')
  }, [isUserMatch, simCurrentRound])

  const handleCancel = useCallback(() => {
    navigate(-1)
  }, [navigate])

  // ---------------------------------------------------------------------------
  // Guard
  // ---------------------------------------------------------------------------

  if (!hasData) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/calendar')} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Back to Calendar
        </Button>
        <p className="text-sm text-muted-foreground">No match data provided.</p>
      </div>
    )
  }

  const homeClub = clubs[homeClubId]
  const awayClub = clubs[awayClubId]

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">

      {/* Header nav */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/calendar')}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Calendar
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm font-medium">
            {homeClub?.abbreviation ?? homeClubId} vs {awayClub?.abbreviation ?? awayClubId}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {isPastGame ? 'Review' : stage === 'pre-game' ? 'Pre-Game' : stage === 'live' ? 'Live' : 'Full Time'}
          </Badge>
        </div>
      </div>

      {/* PRE-GAME */}
      {stage === 'pre-game' && !isPastGame && (
        <PreGameScreen
          homeClubId={homeClubId}
          awayClubId={awayClubId}
          venue={venue}
          round={round + 1}
          isUserMatch={isUserMatch}
          userClubId={playerClubId}
          clubs={clubs}
          players={players}
          matchResults={matchResults}
          h2hRecords={h2hRecords}
          weatherData={weatherData}
          seed={seed}
          showOdds={false}
          onKickOff={handleKickOff}
          onBack={() => navigate('/calendar')}
        />
      )}

      {/* LIVE */}
      {stage === 'live' && simInput && (
        <LiveMatchView
          simInput={simInput}
          userClubId={playerClubId}
          homeClub={homeClub}
          awayClub={awayClub}
          onComplete={handleMatchComplete}
          onCancel={handleCancel}
          spectatorMode={!isUserMatch}
          homeSlotLineup={homeSlotLineup}
          awaySlotLineup={awaySlotLineup}
          homeGameplan={homeGameplan}
          awayGameplan={awayGameplan}
          homeMatchupTactics={homeMatchupTactics}
        />
      )}

      {/* POST-GAME / PAST GAME */}
      {stage === 'post-game' && completedMatch && (
        <div className="space-y-4">
          <PastGameViewer
            match={completedMatch}
            clubs={clubs}
            players={players}
            playerClubId={playerClubId}
          />

          {!isPastGame && (
            <div className="flex justify-end">
              <Button onClick={() => navigate('/calendar')} className="gap-1.5">
                <ChevronLeft className="h-4 w-4" />
                Return to Calendar
              </Button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

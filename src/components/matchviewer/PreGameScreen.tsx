/**
 * PreGameScreen
 *
 * Full pre-game overview shown before the user clicks "Kick Off".
 * Shows: team columns, conditions, form guide, H2H, coin toss (user matches),
 * and odds (if enabled in settings).
 */

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  MapPin, Wind, Cloud, Droplets, Thermometer, Play,
  Trophy, TrendingUp, TrendingDown, Minus, RefreshCw,
} from 'lucide-react'
import type { Club } from '@/types/club'
import type { Player } from '@/types/player'
import type { Match } from '@/types/match'
import type { H2HRecord } from '@/types/history'
import { getOverallRating } from '@/engine/player/playerRating'
import { h2hKey } from '@/engine/history/h2hTracker'
import { windDirectionArrow, windStrengthLabel } from '@/engine/match/weatherEngine'
import type { MatchWeatherData } from '@/engine/match/weatherEngine'
import { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PreGameScreenProps {
  homeClubId: string
  awayClubId: string
  venue: string
  round: number
  isUserMatch: boolean         // true if user manages one of the teams
  userClubId: string
  clubs: Record<string, Club>
  players: Record<string, Player>
  matchResults: Match[]         // all played matches this season (for form guide)
  h2hRecords: Record<string, H2HRecord>
  weatherData: MatchWeatherData | null
  seed: number
  showOdds: boolean
  homeOdds?: number             // e.g. 1.8 = $1.80 per $1
  awayOdds?: number
  onKickOff: (kickingEnd: 'home' | 'away') => void
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function weatherLabel(cond: string): string {
  const m: Record<string, string> = {
    clear: 'Clear', windy: 'Windy', wet: 'Wet', hot: 'Hot', humid: 'Humid',
  }
  return m[cond] ?? cond
}

function weatherIcon(condition: string) {
  switch (condition) {
    case 'wet':   return <Droplets className="h-3.5 w-3.5" />
    case 'windy': return <Wind className="h-3.5 w-3.5" />
    case 'hot':   return <Thermometer className="h-3.5 w-3.5" />
    case 'humid': return <Droplets className="h-3.5 w-3.5 opacity-60" />
    default:      return <Cloud className="h-3.5 w-3.5" />
  }
}

function playerShortName(p: Player) {
  return `${p.firstName[0]}. ${p.lastName}`
}

function getTopPlayers(players: Record<string, Player>, clubId: string, count = 5): Player[] {
  return Object.values(players)
    .filter((p) => p.clubId === clubId && !p.injury)
    .sort((a, b) => getOverallRating(b) - getOverallRating(a))
    .slice(0, count)
}

function FormPip({ result }: { result: 'W' | 'L' | 'D' }) {
  const colors = { W: 'bg-green-500', L: 'bg-red-500', D: 'bg-yellow-500' }
  return (
    <div className={`h-5 w-5 rounded text-[9px] font-bold text-white flex items-center justify-center ${colors[result]}`}>
      {result}
    </div>
  )
}

function getLastFive(matchResults: Match[], clubId: string): Array<{ result: 'W' | 'L' | 'D'; margin: number }> {
  const played = matchResults
    .filter((m) => m.result && (m.homeClubId === clubId || m.awayClubId === clubId))
    .slice(-5)

  return played.map((m) => {
    const r = m.result!
    const isHome = m.homeClubId === clubId
    const myScore = isHome ? r.homeTotalScore : r.awayTotalScore
    const oppScore = isHome ? r.awayTotalScore : r.homeTotalScore
    const margin = myScore - oppScore
    return {
      result: margin > 0 ? 'W' : margin < 0 ? 'L' : 'D',
      margin,
    }
  })
}

// ---------------------------------------------------------------------------
// Coin toss sub-component
// ---------------------------------------------------------------------------

function CoinToss({
  weatherData, seed, userIsHome,
  onChooseEnd,
}: {
  weatherData: MatchWeatherData | null
  seed: number
  userIsHome: boolean
  onChooseEnd: (kickingEnd: 'home' | 'away') => void
}) {
  const [flipped, setFlipped] = useState(false)
  const [spinning, setSpinning] = useState(false)

  const rng = useMemo(() => new SeededRNG(seed + 4444), [seed])
  const coinTossResult: 'home' | 'away' = useMemo(
    () => (rng.next() < 0.5 ? 'home' : 'away'),
    [rng],
  )

  const userWon = userIsHome ? coinTossResult === 'home' : coinTossResult === 'away'

  function handleFlip() {
    setSpinning(true)
    setTimeout(() => {
      setSpinning(false)
      setFlipped(true)
    }, 800)
  }

  const windDir = weatherData?.windDirection
  const windStr = weatherData?.windStrength ?? 'calm'
  const hasWind = windStr !== 'calm'

  return (
    <div className="rounded border border-border/40 p-3 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Coin Toss</div>

      {!flipped ? (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={handleFlip}
            disabled={spinning}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`} />
            {spinning ? 'Flipping…' : 'Flip Coin'}
          </Button>
          <span className="text-[11px] text-muted-foreground">The winner gets to choose their kicking end.</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12px]">
            <Badge variant={userWon ? 'default' : 'secondary'}>
              {userWon ? 'You won the toss!' : 'Opposition won the toss'}
            </Badge>
            {!userWon && (
              <span className="text-muted-foreground text-[11px]">
                {hasWind
                  ? `They chose to kick ${weatherData?.windAdvantageEnd === 'home' ? 'with' : 'into'} the wind.`
                  : 'They elected to kick first.'}
              </span>
            )}
          </div>

          {userWon && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-muted-foreground">
                {hasWind
                  ? `Wind: ${windDir ? windDirectionArrow(windDir) : ''} ${windStrengthLabel(windStr)}. Choose your end for Q1:`
                  : 'Choose your kicking end for Q1:'}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => onChooseEnd(userIsHome ? 'home' : 'away')}
                >
                  {hasWind ? `Kick WITH wind ${windDir ? windDirectionArrow(windDir) : ''}` : 'This End'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => onChooseEnd(userIsHome ? 'away' : 'home')}
                >
                  {hasWind ? `Kick INTO wind ${windDir ? windDirectionArrow(windDir) : ''}` : 'Other End'}
                </Button>
              </div>
            </div>
          )}

          {!userWon && (
            <Button
              size="sm"
              className="w-full text-xs gap-1"
              onClick={() => onChooseEnd(userIsHome ? 'away' : 'home')}
            >
              <Play className="h-3 w-3" />
              Kick Off
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// H2H summary
// ---------------------------------------------------------------------------

function H2HSummary({
  homeClubId, awayClubId, h2hRecords, clubs,
}: {
  homeClubId: string
  awayClubId: string
  h2hRecords: Record<string, H2HRecord>
  clubs: Record<string, Club>
}) {
  const key = h2hKey(homeClubId, awayClubId)
  const rec = h2hRecords[key]

  if (!rec) {
    return (
      <div className="text-[11px] text-muted-foreground italic">No previous meetings recorded.</div>
    )
  }

  const homeAbbr = clubs[homeClubId]?.abbreviation ?? 'HOM'
  const awayAbbr = clubs[awayClubId]?.abbreviation ?? 'AWY'

  // Determine wins from the club perspective
  const homeIsId0 = rec.clubId0 === homeClubId
  const homeWins = homeIsId0 ? rec.wins0 : rec.wins1
  const awayWins = homeIsId0 ? rec.wins1 : rec.wins0
  const total = homeWins + awayWins + rec.draws

  const streak = rec.streak
    ? `${clubs[rec.streak.clubId]?.abbreviation ?? rec.streak.clubId} W${rec.streak.length}`
    : null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 text-[12px]">
        <span className="font-bold tabular-nums" style={{ color: clubs[homeClubId]?.colors.primary }}>
          {homeWins}
        </span>
        <span className="text-muted-foreground text-[10px] flex-1 text-center">
          wins  (of {total} meetings)
        </span>
        <span className="font-bold tabular-nums" style={{ color: clubs[awayClubId]?.colors.primary }}>
          {awayWins}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{homeAbbr}</span>
        {rec.draws > 0 && <span>{rec.draws} draws</span>}
        <span>{awayAbbr}</span>
      </div>
      {streak && (
        <div className="text-[10px] text-muted-foreground">
          Current streak: <span className="font-semibold text-foreground">{streak}</span>
        </div>
      )}
      {rec.lastMeeting && (
        <div className="text-[10px] text-muted-foreground">
          Last meeting: {rec.lastMeeting.score0 > rec.lastMeeting.score1
            ? `${clubs[rec.clubId0]?.abbreviation} won`
            : rec.lastMeeting.score1 > rec.lastMeeting.score0
              ? `${clubs[rec.clubId1]?.abbreviation} won`
              : 'Draw'
          } — {rec.lastMeeting.score0}–{rec.lastMeeting.score1} (Yr {rec.lastMeeting.year}, R{rec.lastMeeting.round})
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PreGameScreen({
  homeClubId, awayClubId, venue, round,
  isUserMatch, userClubId, clubs, players,
  matchResults, h2hRecords, weatherData,
  seed, showOdds, homeOdds, awayOdds,
  onKickOff, onBack,
}: PreGameScreenProps) {
  const homeClub = clubs[homeClubId]
  const awayClub = clubs[awayClubId]
  const homeColor = homeClub?.colors.primary ?? '#6b7280'
  const awayColor = awayClub?.colors.primary ?? '#9ca3af'
  const homeAbbr  = homeClub?.abbreviation   ?? 'HOM'
  const awayAbbr  = awayClub?.abbreviation   ?? 'AWY'

  const userIsHome = userClubId === homeClubId

  const homeTopPlayers = useMemo(() => getTopPlayers(players, homeClubId), [players, homeClubId])
  const awayTopPlayers = useMemo(() => getTopPlayers(players, awayClubId), [players, awayClubId])

  const homeForm = useMemo(() => getLastFive(matchResults, homeClubId), [matchResults, homeClubId])
  const awayForm = useMemo(() => getLastFive(matchResults, awayClubId), [matchResults, awayClubId])

  const [coinTossComplete, setCoinTossComplete] = useState(!isUserMatch)

  function handleCoinTossEnd(kickingEnd: 'home' | 'away') {
    onKickOff(kickingEnd)
  }

  function handleQuickKickOff() {
    onKickOff('home')
  }

  const cond = weatherData
    ? { weather: 'clear' as const, windStrength: weatherData.windStrength }
    : null

  return (
    <div className="space-y-4">

      {/* Match header */}
      <div className="rounded-md border p-4 text-center">
        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <div className="h-12 w-12 rounded-full border-2 border-white/20" style={{ backgroundColor: homeColor }} />
            <span className="font-bold">{homeClub?.name ?? homeAbbr}</span>
            <span className="text-xs text-muted-foreground">Home</span>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-muted-foreground">vs</div>
            <div className="text-xs text-muted-foreground mt-1">Round {round}</div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="h-12 w-12 rounded-full border-2 border-white/20" style={{ backgroundColor: awayColor }} />
            <span className="font-bold">{awayClub?.name ?? awayAbbr}</span>
            <span className="text-xs text-muted-foreground">Away</span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {venue}
          </span>
          {weatherData && weatherData.windStrength !== 'calm' && (
            <span className="inline-flex items-center gap-1">
              <Wind className="h-3 w-3" />
              {windDirectionArrow(weatherData.windDirection)} {windStrengthLabel(weatherData.windStrength)} wind
            </span>
          )}
        </div>
      </div>

      {/* Two-column team info */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { clubId: homeClubId, club: homeClub, color: homeColor, abbr: homeAbbr, topPlayers: homeTopPlayers, form: homeForm, label: 'Home' },
          { clubId: awayClubId, club: awayClub, color: awayColor, abbr: awayAbbr, topPlayers: awayTopPlayers, form: awayForm, label: 'Away' },
        ].map(({ clubId, club, color, abbr, topPlayers, form, label }) => (
          <div key={clubId} className="rounded border border-border/40 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[12px] font-bold truncate" style={{ color }}>{club?.name ?? abbr}</span>
              <Badge variant="outline" className="text-[9px] ml-auto">{label}</Badge>
            </div>

            {/* Form guide */}
            <div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Last 5</div>
              <div className="flex gap-1">
                {form.length === 0
                  ? <span className="text-[10px] text-muted-foreground/60">No games</span>
                  : form.map((f, i) => <FormPip key={i} result={f.result} />)
                }
              </div>
            </div>

            {/* Top players */}
            <div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Key Players</div>
              <div className="space-y-0.5">
                {topPlayers.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-muted-foreground w-6 shrink-0">{p.position.primary}</span>
                    <span className="flex-1 truncate font-medium">{playerShortName(p)}</span>
                    <span className="text-muted-foreground tabular-nums">{getOverallRating(p)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* H2H summary */}
      <div className="rounded border border-border/40 p-3 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Head-to-Head
        </div>
        <H2HSummary
          homeClubId={homeClubId}
          awayClubId={awayClubId}
          h2hRecords={h2hRecords}
          clubs={clubs}
        />
      </div>

      {/* Odds panel */}
      {showOdds && homeOdds !== undefined && awayOdds !== undefined && (
        <div className="rounded border border-border/40 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Odds</div>
          <div className="flex items-center gap-4">
            <div className="flex-1 text-center">
              <div className="text-lg font-bold tabular-nums" style={{ color: homeColor }}>${homeOdds.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">{homeAbbr} win</div>
            </div>
            <div className="text-muted-foreground text-xs">vs</div>
            <div className="flex-1 text-center">
              <div className="text-lg font-bold tabular-nums" style={{ color: awayColor }}>${awayOdds.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">{awayAbbr} win</div>
            </div>
          </div>
        </div>
      )}

      {/* Coin toss / kick off */}
      {isUserMatch ? (
        <CoinToss
          weatherData={weatherData}
          seed={seed}
          userIsHome={userIsHome}
          onChooseEnd={handleCoinTossEnd}
        />
      ) : (
        <div className="flex justify-center pt-2">
          <Button size="lg" onClick={handleQuickKickOff} className="gap-2 px-8">
            <Play className="h-4 w-4" />
            Watch Match
          </Button>
        </div>
      )}

    </div>
  )
}

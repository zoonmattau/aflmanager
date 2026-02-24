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
  MapPin, Wind, Play,
  RefreshCw,
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
  line?: number                 // handicap line (home perspective, e.g. -8.5)
  homeLineOdds?: number
  awayLineOdds?: number
  totalLine?: number
  overOdds?: number
  underOdds?: number
  venueEnds?: [string, string]
  onKickOff: (kickingEnd: 'home' | 'away') => void
  onBack: () => void
  coinTossFlipped?: boolean
  onCoinTossFlipped?: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Match banner
// ---------------------------------------------------------------------------

// {mascots} / {opponents} → smart plural (no double-s for Magpies, Giants, etc.)
const BANNER_TEMPLATES: Array<[string, string]> = [
  // Opponent-aware
  ['{mascots} march, {opponents} fall,', "We'll give it everything, we'll give it all!"],
  ['The {opponents} had their day,', 'Now watch the {mascots} rise and play!'],
  ["We don't fear the {opponents}!", '{mascots} ready — bring it on today!'],
  ['{opponents} cross the border,', '{mascots} lay down the law!'],
  ['Respect the {opponents} but fear us more,', '{mascots} hungry for that winning score!'],
  ['No {opponent} will silence us today!', 'Come on {mascots}, lead the way!'],
  ["The {opponents} think they're ready,", '{mascots} will prove them very wrong!'],
  ['Send those {opponents} packing,', '{mascots} never stop attacking!'],
  ['One team, one dream, one goal today,', 'Send those {opponents} on their way!'],
  ['We bleed for this, we sweat for this,', 'A {opponents} scalp we shall not miss!'],
  ['{mascots} are ready, bring on the {opponents}!', 'Nothing can stop us today!'],
  ['The {opponents} came a long way,', 'Not far enough — {mascots} here to stay!'],
  ['The {opponents} will not pass this ground,', '{mascots} keeping the flag flying proud!'],
  ['Better pack your bags, {opponents},', '{mascots} are taking this one home!'],
  ['Round {round}: {opponents} beware,', '{mascots} have pride beyond compare!'],
  ["We know the {opponents}, we know their game,", "{mascots} won't fold — we play for the name!"],
  // Generic but varied
  ['Fear the {mascots}!', 'Round {round} — no mercy today!'],
  ['Come on the {mascots}!', 'Leave no doubt — leave it all out there!'],
  ['The {mascots} mean business!', 'Forty-four minutes of fire!'],
  ['Heart, sweat and sacrifice,', '{mascots} will pay any price!'],
  ['Run through the banner, hit the ground,', 'Let the crowd hear that winning sound!'],
  ['Today is ours, the day has come,', '{mascots} rise until the final drum!'],
  ['No step back and no backing down,', '{mascots} are here to claim the crown!'],
  ['Heart of a champion, strength of a team,', '{name} alive and chasing the dream!'],
  ['This is our house, our ground, our fight!', '{mascots} united — show them our might!'],
  ['Courage and pride in every stride,', '{mascots} rise — the nation\'s eyes!'],
  ['Another battle, another day,', 'The {mascots} lead the only way!'],
  ['Backs to the wall, give it your all,', '{mascots} stand tall or they fall!'],
  ['Every drop of blood, every bead of sweat,', '{mascots} haven\'t found their limit yet!'],
  ['From first bounce to the final siren,', '{mascots} playing like they\'re on fire!'],
  ['The crowd roars, the {mascots} soar,', 'Nothing less than a win in store!'],
  ['For the jumper, for the club, for the fans,', '{name} executing all the plans!'],
  ['One hundred percent — no less will do,', '{name} — gold through and through!'],
  ['Old scores to settle, new battles to fight,', '{mascots} burn like a flare tonight!'],
  ['When the going gets tough,', '{mascots} get tougher — enough is enough!'],
  ['We carry the weight of every past fight,', '{mascots} play on — we\'ve got the might!'],
]

/** Appends 's' only when the word doesn't already end in one. */
function plural(word: string): string {
  return word.endsWith('s') ? word : `${word}s`
}

/** Simple non-crypto string hash to spread banner picks across clubs. */
function clubHash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

function generateBannerLines(
  myMascot: string,
  opponentMascot: string,
  myName: string,
  round: number,
  seed: number,
  clubId: string,
  excludeIdx?: number,
): [string, string] {
  const rng = new SeededRNG(seed + 9999 + clubHash(clubId))
  let idx = Math.floor(rng.next() * BANNER_TEMPLATES.length)
  if (excludeIdx !== undefined && idx === excludeIdx) {
    idx = (idx + 1) % BANNER_TEMPLATES.length
  }
  const [l1, l2] = BANNER_TEMPLATES[idx]
  const fill = (s: string) =>
    s
      .replace(/\{mascots\}/g, plural(myMascot))
      .replace(/\{mascot\}/g, myMascot)
      .replace(/\{opponents\}/g, plural(opponentMascot))
      .replace(/\{opponent\}/g, opponentMascot)
      .replace(/\{name\}/g, myName)
      .replace(/\{round\}/g, String(round))
  return [fill(l1), fill(l2)]
}

function MatchBanner({
  line1, line2, color, clubName,
}: {
  line1: string; line2: string; color: string; clubName: string
}) {
  return (
    <div className="relative overflow-hidden rounded-sm border bg-white dark:bg-zinc-100 text-center shadow-sm">
      {/* Top bar with club name */}
      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: color }}>
        {clubName}
      </div>
      {/* Banner body */}
      <div className="px-4 py-3">
        <p className="text-[12px] font-bold leading-snug dark:text-zinc-900" style={{ color }}>{line1}</p>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug dark:text-zinc-800" style={{ color }}>{line2}</p>
      </div>
      {/* Bottom bar */}
      <div className="h-2" style={{ backgroundColor: color }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Coin toss sub-component
// ---------------------------------------------------------------------------

function CoinToss({
  weatherData, seed, userIsHome,
  flipped, onFlipped,
  onChooseEnd, venueEnds,
}: {
  weatherData: MatchWeatherData | null
  seed: number
  userIsHome: boolean
  flipped: boolean
  onFlipped: () => void
  onChooseEnd: (kickingEnd: 'home' | 'away') => void
  venueEnds?: [string, string]
}) {
  const rng = useMemo(() => new SeededRNG(seed + 4444), [seed])
  const coinTossResult: 'home' | 'away' = useMemo(
    () => (rng.next() < 0.5 ? 'home' : 'away'),
    [rng],
  )
  const userWon = userIsHome ? coinTossResult === 'home' : coinTossResult === 'away'

  type Phase = 'idle' | 'flipping' | 'done'
  const [phase, setPhase] = useState<Phase>(flipped ? 'done' : 'idle')
  const [chosenEnd, setChosenEnd] = useState<'home' | 'away' | null>(null)

  const windDir = weatherData?.windDirection
  const windStr = weatherData?.windStrength ?? 'calm'
  const hasWind = windStr !== 'calm'

  function handleFlip() {
    setPhase('flipping')
    onFlipped()
    setTimeout(() => setPhase('done'), 1500)
  }

  function handleKickOff() {
    const end = userWon
      ? (chosenEnd ?? (userIsHome ? 'home' : 'away'))
      : (userIsHome ? 'away' : 'home')
    onChooseEnd(end)
  }

  return (
    <div className="rounded border border-border/40 p-3 space-y-3">
      <style>{`
        @keyframes coinFlip {
          0%   { transform: perspective(200px) rotateY(0deg) scale(1); }
          15%  { transform: perspective(200px) rotateY(180deg) scale(1.15); }
          30%  { transform: perspective(200px) rotateY(360deg) scale(1); }
          45%  { transform: perspective(200px) rotateY(540deg) scale(1.15); }
          60%  { transform: perspective(200px) rotateY(720deg) scale(1); }
          75%  { transform: perspective(200px) rotateY(900deg) scale(1.15); }
          90%  { transform: perspective(200px) rotateY(1080deg) scale(1); }
          100% { transform: perspective(200px) rotateY(1260deg) scale(1); }
        }
        .coin-spin { animation: coinFlip 1.5s ease-in-out forwards; }
      `}</style>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Coin Toss</div>

      {/* Coin visual */}
      <div className="flex justify-center py-1">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-black select-none${phase === 'flipping' ? ' coin-spin' : ''}`}
          style={{
            background: phase === 'done' && !userWon
              ? 'linear-gradient(145deg, #9ca3af, #6b7280)'
              : 'linear-gradient(145deg, #fbbf24, #d97706)',
            boxShadow: phase === 'done'
              ? (userWon ? '0 0 16px 4px rgba(251,191,36,0.45)' : '0 2px 8px rgba(0,0,0,0.35)')
              : '0 2px 8px rgba(251,191,36,0.3)',
            color: 'white',
            border: '2px solid rgba(255,255,255,0.2)',
          }}
        >
          {phase === 'idle' && '?'}
          {phase === 'flipping' && '●'}
          {phase === 'done' && (userWon ? '✓' : '✕')}
        </div>
      </div>

      {/* Idle — flip button */}
      {phase === 'idle' && (
        <div className="flex flex-col items-center gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleFlip}>
            <RefreshCw className="h-3.5 w-3.5" />
            Flip Coin
          </Button>
          <span className="text-[10px] text-muted-foreground">Winner chooses their kicking end.</span>
        </div>
      )}

      {/* Flipping */}
      {phase === 'flipping' && (
        <div className="text-center text-[11px] text-muted-foreground animate-pulse">Flipping…</div>
      )}

      {/* Done — result + choices */}
      {phase === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant={userWon ? 'default' : 'secondary'}>
              {userWon ? 'You won the toss!' : 'Opposition won the toss'}
            </Badge>
          </div>

          {/* User won — choose end */}
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
                  variant={chosenEnd === (userIsHome ? 'home' : 'away') ? 'default' : 'outline'}
                  className="flex-1 text-xs"
                  onClick={() => setChosenEnd(userIsHome ? 'home' : 'away')}
                >
                  {venueEnds
                    ? (userIsHome ? venueEnds[0] : venueEnds[1]) + (hasWind ? ` · with wind ${windDir ? windDirectionArrow(windDir) : ''}` : '')
                    : hasWind ? `WITH wind ${windDir ? windDirectionArrow(windDir) : ''}` : 'This End'}
                </Button>
                <Button
                  size="sm"
                  variant={chosenEnd === (userIsHome ? 'away' : 'home') ? 'default' : 'outline'}
                  className="flex-1 text-xs"
                  onClick={() => setChosenEnd(userIsHome ? 'away' : 'home')}
                >
                  {venueEnds
                    ? (userIsHome ? venueEnds[1] : venueEnds[0]) + (hasWind ? ` · into wind ${windDir ? windDirectionArrow(windDir) : ''}` : '')
                    : hasWind ? `INTO wind ${windDir ? windDirectionArrow(windDir) : ''}` : 'Other End'}
                </Button>
              </div>
            </div>
          )}

          {/* Opposition won — info */}
          {!userWon && (
            <div className="text-[11px] text-muted-foreground">
              {hasWind
                ? `They chose to kick ${weatherData?.windAdvantageEnd === 'home' ? 'with' : 'into'} the wind.`
                : 'They elected to kick first.'}
            </div>
          )}

          {/* Kick Off — shown when user lost, or user won and picked an end */}
          {(!userWon || chosenEnd !== null) && (
            <Button size="sm" className="w-full text-xs gap-1.5 mt-1" onClick={handleKickOff}>
              <Play className="h-3 w-3" />
              Kick Off!
            </Button>
          )}
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
  line, homeLineOdds, awayLineOdds, totalLine, overOdds, underOdds,
  venueEnds,
  onKickOff, onBack: _onBack,
  coinTossFlipped: coinTossFlippedProp = false,
  onCoinTossFlipped,
}: PreGameScreenProps) {
  const homeClub = clubs[homeClubId]
  const awayClub = clubs[awayClubId]
  const homeColor = homeClub?.colors.primary ?? '#6b7280'
  const awayColor = awayClub?.colors.primary ?? '#9ca3af'
  const homeAbbr  = homeClub?.abbreviation   ?? 'HOM'
  const awayAbbr  = awayClub?.abbreviation   ?? 'AWY'

  const userIsHome = userClubId === homeClubId

  const [[homeBanner1, homeBanner2], [awayBanner1, awayBanner2]] = useMemo(() => {
    // Determine which template index home will pick so away can avoid it
    const homeRng = new SeededRNG(seed + 9999 + clubHash(homeClubId))
    const homeIdx = Math.floor(homeRng.next() * BANNER_TEMPLATES.length)
    const home = generateBannerLines(
      homeClub?.mascot ?? homeClub?.name ?? homeAbbr,
      awayClub?.mascot ?? awayClub?.name ?? awayAbbr,
      homeClub?.name ?? homeAbbr,
      round, seed, homeClubId,
    )
    const away = generateBannerLines(
      awayClub?.mascot ?? awayClub?.name ?? awayAbbr,
      homeClub?.mascot ?? homeClub?.name ?? homeAbbr,
      awayClub?.name ?? awayAbbr,
      round, seed, awayClubId,
      homeIdx,
    )
    return [home, away]
  }, [homeClub, awayClub, homeAbbr, awayAbbr, homeClubId, awayClubId, round, seed])

  const homeTopPlayers = useMemo(() => getTopPlayers(players, homeClubId), [players, homeClubId])
  const awayTopPlayers = useMemo(() => getTopPlayers(players, awayClubId), [players, awayClubId])

  const homeForm = useMemo(() => getLastFive(matchResults, homeClubId), [matchResults, homeClubId])
  const awayForm = useMemo(() => getLastFive(matchResults, awayClubId), [matchResults, awayClubId])

  const coinTossFlipped = coinTossFlippedProp

  function handleCoinTossEnd(kickingEnd: 'home' | 'away') {
    onKickOff(kickingEnd)
  }

  function handleQuickKickOff() {
    onKickOff('home')
  }

  // H2H data for centre column
  const h2hRec = h2hRecords[h2hKey(homeClubId, awayClubId)]
  const h2hHomeIsId0 = h2hRec?.clubId0 === homeClubId
  const h2hHomeWins = h2hRec ? (h2hHomeIsId0 ? h2hRec.wins0 : h2hRec.wins1) : 0
  const h2hAwayWins = h2hRec ? (h2hHomeIsId0 ? h2hRec.wins1 : h2hRec.wins0) : 0
  const h2hTotal    = h2hRec ? h2hHomeWins + h2hAwayWins + h2hRec.draws : 0
  const h2hStreak   = h2hRec?.streak
    ? `${clubs[h2hRec.streak.clubId]?.abbreviation ?? h2hRec.streak.clubId} W${h2hRec.streak.length}`
    : null

  return (
    <div className="space-y-2">

      {/* Skip pre-game button — top right */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-foreground gap-1"
          onClick={handleQuickKickOff}
        >
          Skip to match
          <Play className="h-3 w-3" />
        </Button>
      </div>

      {/* Compact header: Home — vs / Rd / Venue — Away */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-9 w-9 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: homeColor }} />
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight truncate" style={{ color: homeColor }}>{homeClub?.name ?? homeAbbr}</div>
            <div className="text-[10px] text-muted-foreground">Home</div>
          </div>
        </div>
        <div className="shrink-0 text-center px-1">
          <div className="text-sm font-bold text-muted-foreground">vs</div>
          <div className="text-[10px] text-muted-foreground">Rd {round}</div>
          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5 mt-0.5">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate max-w-[120px]">{venue}</span>
          </div>
          {weatherData && weatherData.windStrength !== 'calm' && (
            <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
              <Wind className="h-2.5 w-2.5 shrink-0" />
              {windDirectionArrow(weatherData.windDirection)} {windStrengthLabel(weatherData.windStrength)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <div className="min-w-0 text-right">
            <div className="text-sm font-bold leading-tight truncate" style={{ color: awayColor }}>{awayClub?.name ?? awayAbbr}</div>
            <div className="text-[10px] text-muted-foreground">Away</div>
          </div>
          <div className="h-9 w-9 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: awayColor }} />
        </div>
      </div>

      {/* Match day banners */}
      <div className="grid grid-cols-2 gap-2">
        <MatchBanner line1={homeBanner1} line2={homeBanner2} color={homeColor} clubName={homeClub?.name ?? homeAbbr} />
        <MatchBanner line1={awayBanner1} line2={awayBanner2} color={awayColor} clubName={awayClub?.name ?? awayAbbr} />
      </div>

      {/* Main panel: Home | H2H + Odds | Away */}
      <div className="grid grid-cols-[1fr_auto_1fr] rounded border border-border/40 overflow-hidden">

        {/* Home column */}
        <div className="p-2 space-y-2">
          <div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Last 5</div>
            <div className="flex gap-1">
              {homeForm.length === 0
                ? <span className="text-[10px] text-muted-foreground/60">No games</span>
                : homeForm.map((f, i) => <FormPip key={i} result={f.result} />)
              }
            </div>
          </div>
          <div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Key Players</div>
            <div className="space-y-0.5">
              {homeTopPlayers.map((p) => (
                <div key={p.id} className="flex items-center gap-1 text-[10px]">
                  <span className="text-muted-foreground w-5 shrink-0 text-[9px]">{p.position.primary}</span>
                  <span className="flex-1 truncate font-medium">{playerShortName(p)}</span>
                  <span className="text-muted-foreground tabular-nums">{getOverallRating(p)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Centre: H2H + Odds */}
        <div className="flex flex-col items-center justify-center gap-1 px-3 py-2 border-x border-border/40 bg-muted/20 text-center min-w-[76px]">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wide">H2H</div>
          {h2hRec ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold tabular-nums leading-none" style={{ color: homeColor }}>{h2hHomeWins}</span>
                <span className="text-[10px] text-muted-foreground">–</span>
                <span className="text-base font-bold tabular-nums leading-none" style={{ color: awayColor }}>{h2hAwayWins}</span>
              </div>
              <div className="text-[9px] text-muted-foreground">{h2hTotal} games{h2hRec.draws > 0 ? `, ${h2hRec.draws}D` : ''}</div>
              {h2hStreak && <div className="text-[9px] font-semibold text-muted-foreground">{h2hStreak}</div>}
              {h2hRec.lastMeeting && (
                <div className="text-[9px] text-muted-foreground">Yr {h2hRec.lastMeeting.year} R{h2hRec.lastMeeting.round}</div>
              )}
            </>
          ) : (
            <div className="text-[9px] text-muted-foreground italic">No data</div>
          )}

          {showOdds && homeOdds != null && awayOdds != null && (
            <div className="mt-1 pt-1 border-t border-border/40 w-full space-y-1">
              {/* H2H win odds */}
              <div className="space-y-0.5">
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Win</div>
                <div className="flex justify-between gap-1 text-[11px] font-bold tabular-nums">
                  <span style={{ color: homeColor }}>${homeOdds.toFixed(2)}</span>
                  <span style={{ color: awayColor }}>${awayOdds.toFixed(2)}</span>
                </div>
              </div>

              {/* Line / handicap */}
              {line != null && homeLineOdds != null && awayLineOdds != null && (
                <div className="space-y-0.5">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Line</div>
                  <div className="flex justify-between gap-1 text-[10px] tabular-nums">
                    <span>
                      <span className="font-semibold" style={{ color: homeColor }}>
                        {line > 0 ? `+${line}` : line}
                      </span>{' '}
                      <span className="text-muted-foreground">${homeLineOdds.toFixed(2)}</span>
                    </span>
                    <span>
                      <span className="font-semibold" style={{ color: awayColor }}>
                        {line > 0 ? `-${line}` : `+${Math.abs(line)}`}
                      </span>{' '}
                      <span className="text-muted-foreground">${awayLineOdds.toFixed(2)}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Over/under total */}
              {totalLine != null && overOdds != null && underOdds != null && (
                <div className="space-y-0.5">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Total</div>
                  <div className="flex justify-between gap-1 text-[10px] tabular-nums">
                    <span>
                      <span className="font-semibold text-foreground">O {totalLine}</span>{' '}
                      <span className="text-muted-foreground">${overOdds.toFixed(2)}</span>
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">U {totalLine}</span>{' '}
                      <span className="text-muted-foreground">${underOdds.toFixed(2)}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Away column */}
        <div className="p-2 space-y-2">
          <div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Last 5</div>
            <div className="flex gap-1">
              {awayForm.length === 0
                ? <span className="text-[10px] text-muted-foreground/60">No games</span>
                : awayForm.map((f, i) => <FormPip key={i} result={f.result} />)
              }
            </div>
          </div>
          <div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Key Players</div>
            <div className="space-y-0.5">
              {awayTopPlayers.map((p) => (
                <div key={p.id} className="flex items-center gap-1 text-[10px]">
                  <span className="text-muted-foreground w-5 shrink-0 text-[9px]">{p.position.primary}</span>
                  <span className="flex-1 truncate font-medium">{playerShortName(p)}</span>
                  <span className="text-muted-foreground tabular-nums">{getOverallRating(p)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Coin toss / kick off */}
      {isUserMatch ? (
        <CoinToss
          weatherData={weatherData}
          seed={seed}
          userIsHome={userIsHome}
          flipped={coinTossFlipped}
          onFlipped={() => onCoinTossFlipped?.()}
          onChooseEnd={handleCoinTossEnd}
          venueEnds={venueEnds}
        />
      ) : (
        <div className="flex justify-center pt-1">
          <Button size="lg" onClick={handleQuickKickOff} className="gap-2 px-8">
            <Play className="h-4 w-4" />
            Watch Match
          </Button>
        </div>
      )}

    </div>
  )
}

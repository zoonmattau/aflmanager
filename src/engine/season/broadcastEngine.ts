/**
 * Broadcast Scheduling Engine
 *
 * Assigns each fixture a broadcast channel (FTA / PayTV / Streaming / None)
 * and tier (marquee / prime / standard / non-broadcast) based on club
 * popularity, ladder position, rivalry status, and timeslot.
 *
 * Channel is determined by the match day/timeslot:
 *   Thursday       → PayTV
 *   Friday         → FTA
 *   Saturday-Early → Streaming
 *   Saturday-Twilight → PayTV
 *   Saturday-Night → FTA
 *   Sunday-Early   → Streaming
 *   Sunday-Twilight → PayTV
 *   Monday         → None
 *
 * Tier escalation is based on combined draw-power of the two clubs:
 *   ≥ 130 → marquee  (flagship game of the round)
 *   ≥  80 → prime
 *   ≥  40 → standard
 *    < 40 → non-broadcast (no meaningful audience draw)
 *
 * Blockbusters always receive at least FTA + marquee.
 */

import type { Fixture, BroadcastChannel, BroadcastTier, MatchDay } from '@/types/season'
import type { Club } from '@/types/club'
import type { LadderEntry } from '@/types/season'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base revenue added to the home club per match (in $M equivalent cents) */
export const BROADCAST_REVENUE_BY_TIER: Record<BroadcastTier, number> = {
  marquee:       600_000,   // $600k
  prime:         350_000,   // $350k
  standard:      150_000,   // $150k
  'non-broadcast': 0,
}

/** Additional fan-satisfaction swing for the user's club based on broadcast tier */
export const BROADCAST_SATISFACTION_BY_TIER: Record<BroadcastTier, number> = {
  marquee:        3,
  prime:          1,
  standard:       0,
  'non-broadcast': -1,
}

// ---------------------------------------------------------------------------
// Channel by timeslot
// ---------------------------------------------------------------------------

const CHANNEL_BY_MATCH_DAY: Record<MatchDay, BroadcastChannel> = {
  Thursday:              'PayTV',
  Friday:                'FTA',
  'Saturday-Early':      'Streaming',
  'Saturday-Afternoon':  'PayTV',
  'Saturday-Twilight':   'PayTV',
  'Saturday-Night':      'FTA',
  'Sunday-Early':        'Streaming',
  'Sunday-Afternoon':    'PayTV',
  'Sunday-Twilight':     'PayTV',
  Monday:                'None',
}

// ---------------------------------------------------------------------------
// Draw-power scoring
// ---------------------------------------------------------------------------

/**
 * Score a club's ability to draw broadcast interest (0-100).
 * Based on club size tier, current ladder position, and rivalry context.
 */
export function getClubDrawPower(
  club: Club,
  ladderPosition: number,   // 1-18, lower is better
): number {
  // Base by club tier
  let score = club.tier === 'large' ? 45 : club.tier === 'medium' ? 30 : 18

  // Ladder bonus: positions 1-4 → +25, 5-8 → +15, 9-12 → +5, 13-18 → 0
  if (ladderPosition <= 4) score += 25
  else if (ladderPosition <= 8) score += 15
  else if (ladderPosition <= 12) score += 5

  return Math.min(100, score)
}

/**
 * Compute combined match draw power for two clubs.
 * Rivalry and blockbuster bonuses applied here.
 */
function matchDrawPower(
  homeClub: Club,
  awayClub: Club,
  homeLadderPos: number,
  awayLadderPos: number,
  isRivalry: boolean,
  isBlockbuster: boolean,
): number {
  const combined = getClubDrawPower(homeClub, homeLadderPos) + getClubDrawPower(awayClub, awayLadderPos)
  const rivalryBonus = isRivalry ? 20 : 0
  const blockbusterBonus = isBlockbuster ? 35 : 0
  return combined + rivalryBonus + blockbusterBonus
}

// ---------------------------------------------------------------------------
// Tier derivation
// ---------------------------------------------------------------------------

function getTierFromDrawPower(drawPower: number): BroadcastTier {
  if (drawPower >= 130) return 'marquee'
  if (drawPower >= 80) return 'prime'
  if (drawPower >= 40) return 'standard'
  return 'non-broadcast'
}

// ---------------------------------------------------------------------------
// Core assignment
// ---------------------------------------------------------------------------

/**
 * Assign a broadcast channel and tier to a single fixture.
 */
export function assignFixtureBroadcast(
  fixture: Fixture,
  homeClub: Club | undefined,
  awayClub: Club | undefined,
  homeLadderPos: number,
  awayLadderPos: number,
  rivalryClubIds: string[],
): Fixture {
  const day = fixture.matchDay ?? 'Saturday-Twilight'
  const channel = CHANNEL_BY_MATCH_DAY[day]

  if (channel === 'None') {
    return { ...fixture, broadcastChannel: 'None', broadcastTier: 'non-broadcast' }
  }

  if (!homeClub || !awayClub) {
    return { ...fixture, broadcastChannel: channel, broadcastTier: 'standard' }
  }

  const isRivalry =
    rivalryClubIds.includes(fixture.awayClubId) ||
    (homeClub.rivalryClubIds ?? []).includes(fixture.awayClubId) ||
    (awayClub.rivalryClubIds ?? []).includes(fixture.homeClubId)

  const isBlockbuster = !!fixture.isBlockbuster

  const drawPower = matchDrawPower(
    homeClub,
    awayClub,
    homeLadderPos,
    awayLadderPos,
    isRivalry,
    isBlockbuster,
  )

  let tier = getTierFromDrawPower(drawPower)

  // Blockbusters always get at least FTA marquee
  if (isBlockbuster) {
    return { ...fixture, broadcastChannel: 'FTA', broadcastTier: 'marquee' }
  }

  // Low-profile games on live channels still get a standard broadcast tier
  if (tier === 'non-broadcast') {
    tier = 'standard'
  }

  return { ...fixture, broadcastChannel: channel, broadcastTier: tier }
}

/**
 * Assign broadcasts to all fixtures in a round.
 * The highest draw-power game that is already on FTA gets 'marquee' regardless.
 * Only one marquee per round on each FTA channel.
 */
export function assignRoundBroadcasts(
  fixtures: Fixture[],
  clubs: Record<string, Club>,
  ladder: LadderEntry[],
): Fixture[] {
  const ladderPosMap = new Map<string, number>()
  ladder.forEach((entry, idx) => ladderPosMap.set(entry.clubId, idx + 1))

  const getLadderPos = (clubId: string) => ladderPosMap.get(clubId) ?? 10

  const assigned = fixtures.map((f) => {
    const homeClub = clubs[f.homeClubId]
    const awayClub = clubs[f.awayClubId]
    const homeLadderPos = getLadderPos(f.homeClubId)
    const awayLadderPos = getLadderPos(f.awayClubId)

    return assignFixtureBroadcast(
      f,
      homeClub,
      awayClub,
      homeLadderPos,
      awayLadderPos,
      homeClub?.rivalryClubIds ?? [],
    )
  })

  // Enforce only one marquee per round (highest draw-power FTA game gets the marquee)
  const ftaGames = assigned.filter((f) => f.broadcastChannel === 'FTA' && !f.isBlockbuster)
  if (ftaGames.filter((f) => f.broadcastTier === 'marquee').length > 1) {
    // Sort by draw power and keep only the top one as marquee
    const scored = ftaGames.map((f) => {
      const homeClub = clubs[f.homeClubId]
      const awayClub = clubs[f.awayClubId]
      const hp = getLadderPos(f.homeClubId)
      const ap = getLadderPos(f.awayClubId)
      const dp = homeClub && awayClub
        ? matchDrawPower(homeClub, awayClub, hp, ap,
            (homeClub.rivalryClubIds ?? []).includes(f.awayClubId), false)
        : 0
      return { fixture: f, drawPower: dp }
    }).sort((a, b) => b.drawPower - a.drawPower)

    const topKey = `${scored[0].fixture.homeClubId}-${scored[0].fixture.awayClubId}`

    return assigned.map((f) => {
      const key = `${f.homeClubId}-${f.awayClubId}`
      if (f.broadcastChannel === 'FTA' && !f.isBlockbuster && f.broadcastTier === 'marquee' && key !== topKey) {
        return { ...f, broadcastTier: 'prime' as BroadcastTier }
      }
      return f
    })
  }

  return assigned
}

// ---------------------------------------------------------------------------
// Revenue & display helpers
// ---------------------------------------------------------------------------

/** Revenue bonus for the home club from broadcast rights. */
export function getBroadcastRevenue(tier: BroadcastTier | undefined): number {
  if (!tier) return 0
  return BROADCAST_REVENUE_BY_TIER[tier]
}

/** Fan satisfaction swing from receiving a marquee/prime broadcast. */
export function getBroadcastSatisfactionSwing(tier: BroadcastTier | undefined): number {
  if (!tier) return 0
  return BROADCAST_SATISFACTION_BY_TIER[tier]
}

/** Human-readable label for a broadcast channel. */
export function getBroadcastChannelLabel(channel: BroadcastChannel | undefined): string {
  switch (channel) {
    case 'FTA':       return 'Free-To-Air'
    case 'PayTV':     return 'Pay TV'
    case 'Streaming': return 'Streaming'
    default:          return 'Not broadcast'
  }
}

/** Short label for display in fixture rows. */
export function getBroadcastChannelShort(channel: BroadcastChannel | undefined): string {
  switch (channel) {
    case 'FTA':       return 'FTA'
    case 'PayTV':     return 'PAY'
    case 'Streaming': return 'STR'
    default:          return ''
  }
}

/** Tailwind color classes for a broadcast channel badge. */
export function getBroadcastChannelColor(channel: BroadcastChannel | undefined): string {
  switch (channel) {
    case 'FTA':       return 'bg-blue-500/20 text-blue-400 border-blue-500/40'
    case 'PayTV':     return 'bg-purple-500/20 text-purple-400 border-purple-500/40'
    case 'Streaming': return 'bg-green-500/20 text-green-400 border-green-500/40'
    default:          return 'bg-muted/30 text-muted-foreground border-border'
  }
}

/** Tailwind color classes for a broadcast tier badge. */
export function getBroadcastTierColor(tier: BroadcastTier | undefined): string {
  switch (tier) {
    case 'marquee':        return 'text-amber-400'
    case 'prime':          return 'text-blue-400'
    case 'standard':       return 'text-muted-foreground'
    case 'non-broadcast':  return 'text-muted-foreground/50'
    default:               return 'text-muted-foreground'
  }
}

/** Human-readable label for a tier. */
export function getBroadcastTierLabel(tier: BroadcastTier | undefined): string {
  switch (tier) {
    case 'marquee':        return 'Marquee'
    case 'prime':          return 'Prime'
    case 'standard':       return 'Standard'
    case 'non-broadcast':  return 'Non-broadcast'
    default:               return ''
  }
}

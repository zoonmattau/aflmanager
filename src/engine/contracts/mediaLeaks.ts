import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { GameSettings, NewsItem } from '@/types/game'
import type { ActiveNegotiation } from '@/types/contract'
import type { SeededRNG } from '@/engine/core/rng'
import { MEDIA_LEAK_BASE_PROBABILITY } from '@/engine/core/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaLeakResult {
  leaked: boolean
  newsItem?: NewsItem
  moodChange?: ActiveNegotiation['playerMood']
}

// ---------------------------------------------------------------------------
// 1. checkForMediaLeak
// ---------------------------------------------------------------------------

/**
 * Check whether a negotiation leaks to the media this tick.
 * Base 15% per tick, modified by player profile and negotiation state.
 */
export function checkForMediaLeak(
  negotiation: ActiveNegotiation,
  player: Player,
  clubs: Record<string, Club>,
  rng: SeededRNG,
  settings: GameSettings,
): MediaLeakResult {
  // Disabled by settings
  if (!settings.realism.mediaLeaks) {
    return { leaked: false }
  }

  // Already leaked
  if (negotiation.mediaLeaked) {
    return { leaked: false }
  }

  // Calculate probability
  let probability = MEDIA_LEAK_BASE_PROBABILITY

  // Higher profile players leak more
  const overall = averageAttributes(player)
  if (overall > 70) probability += 0.10

  // Large gap between offer and demand increases leak chance
  if (negotiation.rounds.length > 0) {
    const lastOffer = negotiation.rounds[negotiation.rounds.length - 1]?.offer
    if (lastOffer) {
      const gapRatio = Math.abs(lastOffer.aav - negotiation.playerDemand.aav) / negotiation.playerDemand.aav
      if (gapRatio > 0.15) probability += 0.05
    }
  }

  // Low professionalism players leak more
  if (player.personality.professionalism < 40) probability += 0.05

  // Hostile mood increases leak chance
  if (negotiation.playerMood === 'hostile') probability += 0.05

  // Roll
  if (!rng.chance(probability)) {
    return { leaked: false }
  }

  // Generate leak news
  const clubName = clubs[negotiation.clubId]?.name ?? negotiation.clubId
  const newsItem = generateLeakNewsItem(
    negotiation, player, clubName, rng, new Date().toISOString().slice(0, 10),
  )

  // Process consequences
  const moodChange = processLeakConsequences(negotiation, player)

  return {
    leaked: true,
    newsItem,
    moodChange,
  }
}

// ---------------------------------------------------------------------------
// 2. generateLeakNewsItem
// ---------------------------------------------------------------------------

const LEAK_TEMPLATES = [
  {
    headline: (name: string, club: string) => `Sources: ${name} in advanced talks with ${club}`,
    body: (name: string, club: string, aav: string) =>
      `Multiple sources have confirmed that ${name} and ${club} are in active contract negotiations. ` +
      `The ${name.split(' ').pop()} camp is believed to be seeking in the vicinity of ${aav} per season.`,
  },
  {
    headline: (name: string, _club: string) => `${name}'s camp seeking big payday`,
    body: (name: string, club: string, aav: string) =>
      `The management team of ${name} has reportedly set a price tag of around ${aav} per year ` +
      `in ongoing contract discussions with ${club}. The talks are understood to be at a delicate stage.`,
  },
  {
    headline: (name: string, club: string) => `Talks between ${name} and ${club} hit a snag`,
    body: (name: string, club: string, _aav: string) =>
      `Contract negotiations between ${name} and ${club} have reportedly stalled, ` +
      `with the two parties understood to be some distance apart on key terms. ` +
      `The situation will be closely monitored over coming weeks.`,
  },
  {
    headline: (name: string, club: string) => `${club} table offer to ${name}`,
    body: (name: string, club: string, aav: string) =>
      `${club} have formally tabled a contract offer to ${name}, ` +
      `believed to be in the range of ${aav} per season. ` +
      `The player's camp is currently weighing up the proposal.`,
  },
  {
    headline: (name: string, _club: string) => `${name} contract saga continues`,
    body: (name: string, club: string, _aav: string) =>
      `The contract situation surrounding ${name} at ${club} continues to drag on, ` +
      `with neither party willing to budge on their position. ` +
      `Rival clubs are understood to be monitoring developments closely.`,
  },
]

function generateLeakNewsItem(
  negotiation: ActiveNegotiation,
  player: Player,
  clubName: string,
  rng: SeededRNG,
  currentDate: string,
): NewsItem {
  const template = rng.pick(LEAK_TEMPLATES)
  const playerName = `${player.firstName} ${player.lastName}`
  const aavStr = `$${negotiation.playerDemand.aav.toLocaleString()}`

  return {
    id: `leak_${negotiation.id}_${rng.nextInt(1000, 9999)}`,
    date: currentDate,
    headline: template.headline(playerName, clubName),
    body: template.body(playerName, clubName, aavStr),
    category: 'contract',
    clubIds: [negotiation.clubId],
    playerIds: [player.id],
  }
}

// ---------------------------------------------------------------------------
// 3. processLeakConsequences
// ---------------------------------------------------------------------------

function processLeakConsequences(
  negotiation: ActiveNegotiation,
  player: Player,
): ActiveNegotiation['playerMood'] | undefined {
  // Ambitious players: neutral/positive reaction to media attention
  if (player.personality.ambition > 70) {
    if (negotiation.playerMood === 'reluctant') return 'neutral'
    if (negotiation.playerMood === 'neutral') return 'eager'
    return undefined
  }

  // Loyal players: negative reaction to leaks
  if (player.personality.loyalty > 70) {
    if (negotiation.playerMood === 'eager') return 'neutral'
    if (negotiation.playerMood === 'neutral') return 'reluctant'
    return 'hostile'
  }

  return undefined
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function averageAttributes(player: Player): number {
  const values = Object.values(player.attributes) as number[]
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

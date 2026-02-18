/**
 * Preseason Preview Engine
 *
 * Generates a full long-form "Season Preview" article from live game state,
 * including Top 50 players, projected All-Australian, storylines, ladder
 * predictions, and players to watch. Pure TS — no React imports.
 */

import type { Player, PlayerPositionType } from '@/types/player'
import type { Club } from '@/types/club'
import type { LadderEntry } from '@/types/season'
import type { GameHistory } from '@/types/history'
import { getOverallRating, getPlayerStarRating } from '@/engine/player/playerRating'
import { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Top50Entry {
  rank: number
  playerId: string
  playerName: string
  clubId: string
  clubName: string
  age: number
  position: PlayerPositionType
  overall: number
  stars: number
  writeup: string
}

export interface ProjectedAASlot {
  position: string
  playerId: string
  playerName: string
  clubId: string
  clubName: string
  overall: number
  stars: number
}

export interface ProjectedAllAustralian {
  slots: ProjectedAASlot[]
  captainId: string
}

export type StorylineCategory =
  | 'premiership-favourites'
  | 'rebuilding'
  | 'breakout-candidates'
  | 'coach-hot-seats'
  | 'rivalry-rematches'
  | 'injury-returns'
  | 'contract-year'

export interface Storyline {
  category: StorylineCategory
  title: string
  body: string
  clubIds: string[]
  playerIds: string[]
}

export type LadderTier = 'premiership-contenders' | 'finals-contenders' | 'mid-table' | 'rebuilding'

export interface LadderPrediction {
  tier: LadderTier
  tierLabel: string
  clubs: Array<{ clubId: string; clubName: string; reason: string }>
}

export interface PlayerToWatch {
  playerId: string
  playerName: string
  clubId: string
  clubName: string
  age: number
  position: PlayerPositionType
  overall: number
  reason: string
}

export interface PreseasonPreview {
  year: number
  generatedDate: string
  headline: string
  intro: string
  top50: Top50Entry[]
  projectedAA: ProjectedAllAustralian
  storylines: Storyline[]
  ladderPredictions: LadderPrediction[]
  playersToWatch: PlayerToWatch[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function playerName(p: Player): string {
  return `${p.firstName} ${p.lastName}`
}

function positionLabel(pos: PlayerPositionType): string {
  const labels: Record<PlayerPositionType, string> = {
    BP: 'Back Pocket', FB: 'Full Back', HBF: 'Half Back',
    CHB: 'Centre Half Back', W: 'Wing', IM: 'Inside Mid',
    OM: 'Outside Mid', RK: 'Ruck', HFF: 'Half Forward',
    CHF: 'Centre Half Forward', FP: 'Forward Pocket', FF: 'Full Forward',
  }
  return labels[pos] ?? pos
}

function posCategory(pos: PlayerPositionType): 'DEF' | 'MID' | 'FWD' | 'RUC' {
  if (['FB', 'CHB', 'BP', 'HBF'].includes(pos)) return 'DEF'
  if (['IM', 'OM', 'W'].includes(pos)) return 'MID'
  if (pos === 'RK') return 'RUC'
  return 'FWD'
}

interface ScoredPlayer {
  player: Player
  overall: number
  stars: number
  compositeScore: number
}

function scoreAllPlayers(players: Record<string, Player>): ScoredPlayer[] {
  return Object.values(players).map((p) => {
    const overall = getOverallRating(p)
    const stars = getPlayerStarRating(p, overall)
    // Composite weighs overall, form, fitness, age curve
    const ageFactor = p.age >= (p.hiddenAttributes.peakAgeStart ?? 24) &&
      p.age <= (p.hiddenAttributes.peakAgeEnd ?? 30) ? 1.05 : 1.0
    const formFactor = 0.8 + (p.form / 100) * 0.4 // 0.8–1.2
    const fitnessFactor = p.fitness >= 80 ? 1.0 : 0.9
    const injuryPenalty = p.injury ? 0.85 : 1.0
    const compositeScore = overall * ageFactor * formFactor * fitnessFactor * injuryPenalty
    return { player: p, overall, stars, compositeScore }
  })
}

function ordinal(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

// ---------------------------------------------------------------------------
// Top 50 Players
// ---------------------------------------------------------------------------

function generateTop50WriteUp(
  rank: number,
  sp: ScoredPlayer,
  club: Club,
  _rng: SeededRNG,
): string {
  const p = sp.player
  const name = playerName(p)
  const pos = positionLabel(p.position.primary)
  const gp = p.careerStats.gamesPlayed
  const goals = p.careerStats.goals

  // Gather superlatives from attributes
  const attrs = p.attributes
  const topSkills: string[] = []
  if (attrs.kickingEfficiency >= 75) topSkills.push('elite ball use')
  if (attrs.contested >= 75) topSkills.push('contested beast')
  if (attrs.markingContested >= 75) topSkills.push('contested marking')
  if (attrs.speed >= 80) topSkills.push('electrifying pace')
  if (attrs.leadership >= 75) topSkills.push('leadership')
  if (attrs.goalkicking >= 75) topSkills.push('deadly in front of goal')
  if (attrs.creativity >= 75) topSkills.push('creative vision')
  if (attrs.intercept >= 75) topSkills.push('intercept reading')
  if (attrs.endurance >= 80) topSkills.push('engine room')
  if (attrs.clearance >= 75) topSkills.push('clearance dominance')

  const skillPhrase = topSkills.length > 0
    ? `Known for ${topSkills.slice(0, 3).join(', ')}.`
    : `A well-rounded ${pos.toLowerCase()} who contributes across the board.`

  const injuryNote = p.injury
    ? ` Currently recovering from a ${p.injury.type} (${p.injury.weeksRemaining} weeks remaining).`
    : ''

  const contractNote = p.contract.yearsRemaining === 1
    ? ' In the final year of his contract — a big season ahead.'
    : ''

  const agePhrase = p.age <= 22
    ? `Still only ${p.age}, the ${club.name} youngster has his best years ahead.`
    : p.age >= 31
      ? `At ${p.age}, the veteran continues to defy Father Time.`
      : `At ${p.age}, firmly in his prime years.`

  const statsPhrase = gp > 0
    ? `Has ${gp} career game${gp !== 1 ? 's' : ''} under his belt${goals > 20 ? ` with ${goals} goals` : ''}.`
    : 'Yet to debut at senior level.'

  if (rank <= 5) {
    return `${name} enters ${club.currentYear ?? 'the season'} as one of the game's premier talents. ` +
      `The ${club.name} ${pos.toLowerCase()} rated ${sp.overall} overall (${sp.stars}★). ` +
      `${skillPhrase} ${agePhrase} ${statsPhrase}${injuryNote}${contractNote}`
  }
  if (rank <= 20) {
    return `${club.name}'s ${name} (${sp.overall} OVR, ${sp.stars}★) is a ${pos.toLowerCase()} who shapes games. ` +
      `${skillPhrase} ${agePhrase}${injuryNote}${contractNote}`
  }
  return `${name} (${club.name}) — ${pos}, ${sp.overall} OVR. ${skillPhrase}${injuryNote}${contractNote}`
}

function buildTop50(
  scored: ScoredPlayer[],
  clubs: Record<string, Club>,
  rng: SeededRNG,
): Top50Entry[] {
  const sorted = [...scored]
    .filter((sp) => sp.player.listStatus !== 'injured-list' || sp.player.injury === null)
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 50)

  return sorted.map((sp, i) => {
    const rank = i + 1
    const club = clubs[sp.player.clubId]
    return {
      rank,
      playerId: sp.player.id,
      playerName: playerName(sp.player),
      clubId: sp.player.clubId,
      clubName: club?.name ?? sp.player.clubId,
      age: sp.player.age,
      position: sp.player.position.primary,
      overall: sp.overall,
      stars: sp.stars,
      writeup: generateTop50WriteUp(rank, sp, club, rng),
    }
  })
}

// ---------------------------------------------------------------------------
// Projected All-Australian
// ---------------------------------------------------------------------------

const AA_SLOTS: Array<{ position: string; count: number; eligible: PlayerPositionType[] }> = [
  { position: 'Defender', count: 6, eligible: ['BP', 'FB', 'HBF', 'CHB'] },
  { position: 'Midfielder', count: 8, eligible: ['IM', 'OM', 'W'] },
  { position: 'Forward', count: 6, eligible: ['HFF', 'CHF', 'FP', 'FF'] },
  { position: 'Ruck', count: 1, eligible: ['RK'] },
  { position: 'Interchange', count: 1, eligible: [] },
]

function buildProjectedAA(
  scored: ScoredPlayer[],
  clubs: Record<string, Club>,
): ProjectedAllAustralian {
  const sorted = [...scored]
    .filter((sp) => !sp.player.injury)
    .sort((a, b) => b.compositeScore - a.compositeScore)

  const selected: ProjectedAASlot[] = []
  const used = new Set<string>()

  for (const slot of AA_SLOTS) {
    let filled = 0
    const eligible = slot.eligible.length > 0
      ? sorted.filter((sp) => !used.has(sp.player.id) && slot.eligible.includes(sp.player.position.primary))
      : sorted.filter((sp) => !used.has(sp.player.id))

    for (const sp of eligible) {
      if (filled >= slot.count) break
      const club = clubs[sp.player.clubId]
      selected.push({
        position: slot.position,
        playerId: sp.player.id,
        playerName: playerName(sp.player),
        clubId: sp.player.clubId,
        clubName: club?.name ?? sp.player.clubId,
        overall: sp.overall,
        stars: sp.stars,
      })
      used.add(sp.player.id)
      filled++
    }
  }

  // Captain = highest leadership among selected
  let captainId = selected[0]?.playerId ?? ''
  let highestLeadership = -1
  for (const slot of selected) {
    const p = scored.find((sp) => sp.player.id === slot.playerId)?.player
    if (p && p.attributes.leadership > highestLeadership) {
      highestLeadership = p.attributes.leadership
      captainId = p.id
    }
  }

  return { slots: selected, captainId }
}

// ---------------------------------------------------------------------------
// Storylines
// ---------------------------------------------------------------------------

function buildStorylines(
  scored: ScoredPlayer[],
  clubs: Record<string, Club>,
  ladder: LadderEntry[],
  history: GameHistory,
  currentYear: number,
): Storyline[] {
  const stories: Storyline[] = []
  const clubIds = Object.keys(clubs)
  const clubArray = Object.values(clubs)

  // -- Premiership Favourites --
  // Top 3 clubs by average player rating (weighted by top-22 players)
  const clubStrength = clubIds.map((cid) => {
    const clubPlayers = scored
      .filter((sp) => sp.player.clubId === cid && !sp.player.injury)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 22)
    const avgRating = clubPlayers.length > 0
      ? clubPlayers.reduce((s, sp) => s + sp.compositeScore, 0) / clubPlayers.length
      : 0
    return { clubId: cid, avgRating, top22Count: clubPlayers.length }
  }).sort((a, b) => b.avgRating - a.avgRating)

  const topContenders = clubStrength.slice(0, 3)
  if (topContenders.length > 0) {
    const names = topContenders.map((c) => clubs[c.clubId]?.name ?? c.clubId)
    stories.push({
      category: 'premiership-favourites',
      title: 'Premiership Race: Who Stands Tallest?',
      body: `${names[0]} head into the season as flag favourites, boasting the strongest list on paper. ` +
        `${names[1] ? `${names[1]} and ${names[2] ?? 'others'} aren't far behind, ` : ''}` +
        `with all three clubs possessing the talent to go deep into September. ` +
        `Last year's Grand Finalists will be out for redemption, but the league's competitive balance means nothing is guaranteed.`,
      clubIds: topContenders.map((c) => c.clubId),
      playerIds: [],
    })
  }

  // -- Rebuilding Clubs --
  const rebuilding = clubStrength
    .filter((c) => {
      const club = clubs[c.clubId]
      return club?.aiPersonality.competitiveWindow === 'rebuilding' ||
        c.avgRating < clubStrength[Math.floor(clubStrength.length / 2)]?.avgRating
    })
    .slice(-3)
    .reverse()

  if (rebuilding.length > 0) {
    const rebuildNames = rebuilding.map((c) => clubs[c.clubId]?.name ?? c.clubId)
    const youngStarsText = rebuilding.map((c) => {
      const youngster = scored
        .filter((sp) => sp.player.clubId === c.clubId && sp.player.age <= 22)
        .sort((a, b) => b.compositeScore - a.compositeScore)[0]
      return youngster ? `${playerName(youngster.player)} (${clubs[c.clubId]?.name})` : null
    }).filter(Boolean)

    stories.push({
      category: 'rebuilding',
      title: 'The Long Road Back: Clubs in Rebuild Mode',
      body: `${rebuildNames.join(', ')} face seasons where development trumps results. ` +
        `${youngStarsText.length > 0 ? `Keep an eye on emerging talents like ${youngStarsText.slice(0, 2).join(' and ')}, ` +
          `who could fast-track their clubs' rebuilds. ` : ''}` +
        `Patience will be tested, but the draft picks and young talent flowing through could pay dividends down the line.`,
      clubIds: rebuilding.map((c) => c.clubId),
      playerIds: [],
    })
  }

  // -- Breakout Candidates --
  const breakouts = scored
    .filter((sp) => {
      const p = sp.player
      return p.age >= 20 && p.age <= 23 &&
        p.hiddenAttributes.potentialCeiling >= 70 &&
        sp.overall < p.hiddenAttributes.potentialCeiling - 5 &&
        !p.injury
    })
    .sort((a, b) => {
      const gapA = a.player.hiddenAttributes.potentialCeiling - a.overall
      const gapB = b.player.hiddenAttributes.potentialCeiling - b.overall
      return gapB - gapA
    })
    .slice(0, 5)

  if (breakouts.length > 0) {
    const breakoutNames = breakouts.map((sp) =>
      `${playerName(sp.player)} (${clubs[sp.player.clubId]?.name}, ${sp.player.age}yo)`
    )
    stories.push({
      category: 'breakout-candidates',
      title: 'Breakout Season? Five Players Ready to Explode',
      body: `These young guns have the talent to announce themselves on the biggest stage this year: ` +
        `${breakoutNames.join('; ')}. ` +
        `Each possesses the raw ability and upside to take the next step — all they need is opportunity and consistency.`,
      clubIds: breakouts.map((sp) => sp.player.clubId),
      playerIds: breakouts.map((sp) => sp.player.id),
    })
  }

  // -- Coach Hot Seats --
  const hotSeats = clubArray
    .filter((club) => {
      // Clubs that finished bottom half last season + low fan satisfaction
      const lastPos = club.lastSeasonLadderPosition ?? 9
      const fanSat = club.fanSatisfaction ?? 50
      return lastPos > 12 && fanSat < 40
    })
    .slice(0, 3)

  if (hotSeats.length > 0) {
    stories.push({
      category: 'coach-hot-seats',
      title: 'Under Pressure: Coaches Facing Make-or-Break Seasons',
      body: `${hotSeats.map((c) => c.name).join(', ')} ${hotSeats.length === 1 ? 'enters' : 'enter'} the season with the pressure valve firmly turned up. ` +
        `Fan frustration is simmering after disappointing campaigns, and anything less than visible improvement ` +
        `could see coaching changes before season's end.`,
      clubIds: hotSeats.map((c) => c.id),
      playerIds: [],
    })
  }

  // -- Rivalry Rematches --
  const rivalries: Array<[Club, Club]> = []
  const seenPairs = new Set<string>()
  for (const club of clubArray) {
    for (const rivalId of club.rivalryClubIds ?? []) {
      const key = [club.id, rivalId].sort().join('-')
      if (!seenPairs.has(key) && clubs[rivalId]) {
        seenPairs.add(key)
        rivalries.push([club, clubs[rivalId]])
      }
    }
  }

  if (rivalries.length > 0) {
    const top3 = rivalries.slice(0, 3)
    stories.push({
      category: 'rivalry-rematches',
      title: 'Rivalries Renewed: The Matchups We Can\'t Wait For',
      body: top3.map(([a, b]) => `${a.name} v ${b.name}`).join(', ') +
        ` — these grudge matches will once again define the fixture calendar. ` +
        `Whether it's bragging rights, finals positioning, or pure tribal passion, ` +
        `these clashes never disappoint.`,
      clubIds: top3.flatMap(([a, b]) => [a.id, b.id]),
      playerIds: [],
    })
  }

  // -- Injury Returns --
  const returningFromInjury = scored
    .filter((sp) => {
      const p = sp.player
      return p.injury !== null &&
        (p.injury.weeksRemaining ?? 0) <= 4 &&
        sp.overall >= 60
    })
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 5)

  if (returningFromInjury.length > 0) {
    const returnNames = returningFromInjury.map((sp) =>
      `${playerName(sp.player)} (${clubs[sp.player.clubId]?.name}, ${sp.player.injury?.type})`
    )
    stories.push({
      category: 'injury-returns',
      title: 'Welcome Back: Stars Set to Return from Injury',
      body: `${returnNames.join('; ')} are all closing in on returns from injury. ` +
        `Their comebacks could be the factor that tilts the balance for their respective clubs. ` +
        `After long stints on the sidelines, these players are hungry to make up for lost time.`,
      clubIds: returningFromInjury.map((sp) => sp.player.clubId),
      playerIds: returningFromInjury.map((sp) => sp.player.id),
    })
  }

  // -- Contract Year Players --
  const contractYear = scored
    .filter((sp) => {
      const p = sp.player
      return p.contract.yearsRemaining === 1 && sp.overall >= 60 && !p.injury
    })
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 8)

  if (contractYear.length > 0) {
    const names = contractYear.slice(0, 5).map((sp) =>
      `${playerName(sp.player)} (${clubs[sp.player.clubId]?.name})`
    )
    stories.push({
      category: 'contract-year',
      title: 'Playing for Their Futures: Stars in Contract Years',
      body: `${names.join(', ')} are among the biggest names entering the final year of their deals. ` +
        `Contract-year motivation is a real thing — expect some of these players to produce career-best seasons ` +
        `as they play for their next deal. Others may become restless if their clubs can't match ambition with results.`,
      clubIds: contractYear.map((sp) => sp.player.clubId),
      playerIds: contractYear.map((sp) => sp.player.id),
    })
  }

  return stories
}

// ---------------------------------------------------------------------------
// Ladder Predictions
// ---------------------------------------------------------------------------

function buildLadderPredictions(
  scored: ScoredPlayer[],
  clubs: Record<string, Club>,
): LadderPrediction[] {
  const clubIds = Object.keys(clubs)

  // Rank clubs by best-22 composite
  const ranked = clubIds.map((cid) => {
    const clubPlayers = scored
      .filter((sp) => sp.player.clubId === cid && !sp.player.injury)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 22)
    const avgRating = clubPlayers.length > 0
      ? clubPlayers.reduce((s, sp) => s + sp.compositeScore, 0) / clubPlayers.length
      : 0
    const depthScore = scored.filter((sp) => sp.player.clubId === cid && sp.overall >= 55).length
    const youthScore = scored
      .filter((sp) => sp.player.clubId === cid && sp.player.age <= 23)
      .reduce((s, sp) => s + sp.compositeScore, 0) / Math.max(1, scored.filter((sp) => sp.player.clubId === cid && sp.player.age <= 23).length)
    const injuredCount = scored.filter((sp) => sp.player.clubId === cid && sp.player.injury).length

    return {
      clubId: cid,
      clubName: clubs[cid]?.name ?? cid,
      avgRating,
      depthScore,
      youthScore,
      injuredCount,
      compositeRank: avgRating * 0.7 + depthScore * 0.15 + youthScore * 0.05 - injuredCount * 1.5,
    }
  }).sort((a, b) => b.compositeRank - a.compositeRank)

  const total = ranked.length
  const tierSize = Math.max(1, Math.ceil(total / 4))

  const tiers: Array<{ tier: LadderTier; label: string }> = [
    { tier: 'premiership-contenders', label: 'Premiership Contenders' },
    { tier: 'finals-contenders', label: 'Finals Contenders' },
    { tier: 'mid-table', label: 'Mid-Table' },
    { tier: 'rebuilding', label: 'Rebuilding / Bottom Tier' },
  ]

  return tiers.map((t, i) => {
    const start = i * tierSize
    const end = i === tiers.length - 1 ? total : Math.min(start + tierSize, total)
    const tierClubs = ranked.slice(start, end)

    return {
      tier: t.tier,
      tierLabel: t.label,
      clubs: tierClubs.map((c) => {
        let reason = ''
        if (t.tier === 'premiership-contenders') {
          reason = `Deep list with elite talent across the ground. Rated ${c.avgRating.toFixed(0)} average OVR.`
        } else if (t.tier === 'finals-contenders') {
          reason = `Strong enough to challenge for finals but may lack the depth to go all the way.`
        } else if (t.tier === 'mid-table') {
          reason = `A mixed bag — capable of upsetting anyone on their day but inconsistency will be the enemy.`
        } else {
          reason = c.injuredCount > 3
            ? `Hampered by injuries and a thin list. Development is the priority.`
            : `Lacking the elite talent to compete consistently. A season for building.`
        }
        return { clubId: c.clubId, clubName: c.clubName, reason }
      }),
    }
  })
}

// ---------------------------------------------------------------------------
// Players to Watch
// ---------------------------------------------------------------------------

function buildPlayersToWatch(
  scored: ScoredPlayer[],
  clubs: Record<string, Club>,
): PlayerToWatch[] {
  const candidates: Array<{ sp: ScoredPlayer; reason: string; priority: number }> = []

  for (const sp of scored) {
    const p = sp.player
    if (p.injury) continue

    // Young high-potential
    if (p.age <= 22 && p.hiddenAttributes.potentialCeiling >= 75 && sp.overall >= 50) {
      candidates.push({
        sp,
        reason: `A ${p.age}-year-old with sky-high potential — could emerge as a future star for ${clubs[p.clubId]?.name}.`,
        priority: p.hiddenAttributes.potentialCeiling + (22 - p.age) * 2,
      })
    }

    // Contract year + elite
    if (p.contract.yearsRemaining === 1 && sp.overall >= 70) {
      candidates.push({
        sp,
        reason: `Playing in the final year of his contract. Expect big-time motivation from this ${positionLabel(p.position.primary).toLowerCase()}.`,
        priority: sp.overall + 10,
      })
    }

    // Comeback from long injury
    if (p.injuryHistory.length > 0 && !p.injury && sp.overall >= 65) {
      const lastInjury = p.injuryHistory[p.injuryHistory.length - 1]
      if (lastInjury && lastInjury.initialWeeks >= 8) {
        candidates.push({
          sp,
          reason: `Returns from a serious ${lastInjury.type} — if fully fit, a genuine match-winner for ${clubs[p.clubId]?.name}.`,
          priority: sp.overall + 5,
        })
      }
    }

    // Veterans defying age
    if (p.age >= 31 && sp.overall >= 65) {
      candidates.push({
        sp,
        reason: `At ${p.age}, still performing at a high level. Could this be the swansong season for the ${clubs[p.clubId]?.name} stalwart?`,
        priority: sp.overall + p.age - 28,
      })
    }
  }

  // De-duplicate by player, keeping highest priority reason
  const byPlayer = new Map<string, typeof candidates[0]>()
  for (const c of candidates) {
    const existing = byPlayer.get(c.sp.player.id)
    if (!existing || c.priority > existing.priority) {
      byPlayer.set(c.sp.player.id, c)
    }
  }

  return [...byPlayer.values()]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10)
    .map((c) => ({
      playerId: c.sp.player.id,
      playerName: playerName(c.sp.player),
      clubId: c.sp.player.clubId,
      clubName: clubs[c.sp.player.clubId]?.name ?? c.sp.player.clubId,
      age: c.sp.player.age,
      position: c.sp.player.position.primary,
      overall: c.sp.overall,
      reason: c.reason,
    }))
}

// ---------------------------------------------------------------------------
// Intro & Headline
// ---------------------------------------------------------------------------

function buildIntro(
  year: number,
  clubs: Record<string, Club>,
  history: GameHistory,
  top50: Top50Entry[],
): { headline: string; intro: string } {
  const teamCount = Object.keys(clubs).length
  const lastSeason = history.seasons[history.seasons.length - 1]
  const reigning = lastSeason ? clubs[lastSeason.premierClubId]?.name : null

  const headline = `${year} AFL Season Preview: ${teamCount} Teams, One Flag`

  const reigningText = reigning
    ? `${reigning} enter the season as reigning premiers, with a target firmly on their backs. `
    : ''
  const topPlayerText = top50.length > 0
    ? `${top50[0].playerName} leads our Top 50 player countdown as the league's best heading into Round 1.`
    : ''

  const intro = `The ${year} AFL season is upon us. ` +
    `${reigningText}` +
    `With ${teamCount} clubs vying for ultimate glory, we break down everything you need to know ` +
    `before the first bounce. From our comprehensive Top 50 player rankings to bold predictions ` +
    `for how the ladder will shake out, this is your complete guide to the season ahead. ` +
    `${topPlayerText}`

  return { headline, intro }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generatePreseasonPreview(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  ladder: LadderEntry[],
  history: GameHistory,
  currentYear: number,
  currentDate: string,
  rngSeed: number,
): PreseasonPreview {
  const rng = new SeededRNG(rngSeed + 9999)
  const scored = scoreAllPlayers(players)

  const top50 = buildTop50(scored, clubs, rng)
  const projectedAA = buildProjectedAA(scored, clubs)
  const storylines = buildStorylines(scored, clubs, ladder, history, currentYear)
  const ladderPredictions = buildLadderPredictions(scored, clubs)
  const playersToWatch = buildPlayersToWatch(scored, clubs)

  const { headline, intro } = buildIntro(currentYear, clubs, history, top50)

  return {
    year: currentYear,
    generatedDate: currentDate,
    headline,
    intro,
    top50,
    projectedAA,
    storylines,
    ladderPredictions,
    playersToWatch,
  }
}

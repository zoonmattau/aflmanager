import type {
  LegacyState,
  LegacyPointsBreakdown,
  BoardExpectation,
  BoardMood,
  DynastySeasonEntry,
  FinalPosition,
  ChallengeTemplate,
  ActiveChallenge,
} from '@/types/legacy'
import type { CareerObjective } from '@/types/achievements'

// ---------------------------------------------------------------------------
// Static challenge templates
// ---------------------------------------------------------------------------

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: 'back-to-back',
    title: 'Back-to-Back',
    description: 'Win back-to-back premierships.',
    rules: [
      'Win the premiership in the next season',
      'No salary cap or list rule relaxations',
    ],
    legacyReward: 75,
    targetSeasons: 1,
  },
  {
    id: 'three-peat',
    title: 'Three-Peat',
    description: 'Win three consecutive premierships.',
    rules: [
      'Win the premiership in each of the next 2 seasons',
      'Standard rules apply',
    ],
    legacyReward: 150,
    targetSeasons: 2,
  },
  {
    id: 'youth-only',
    title: 'Youth Revolution',
    description: 'Win a premiership using only players aged 23 or under in the Grand Final.',
    rules: [
      'No player aged 24+ may play in a final',
      'Trade in of older players is permitted but they cannot play finals',
      'Standard salary cap applies',
    ],
    legacyReward: 100,
    targetSeasons: 3,
  },
  {
    id: 'low-budget',
    title: 'Shoestring Budget',
    description: 'Win a premiership while spending under 80% of the salary cap.',
    rules: [
      'Total player salaries must not exceed 80% of the salary cap',
      'Challenge is on the honour system',
    ],
    legacyReward: 80,
    targetSeasons: 2,
  },
  {
    id: 'dynasty-five',
    title: 'Dynasty',
    description: 'Win 5 premierships in total (cumulative over your career).',
    rules: [
      'Accumulate 5 premiership wins across any seasons',
      'Challenge completes when the 5th flag is won',
    ],
    legacyReward: 200,
    targetSeasons: 10,
  },
  {
    id: 'rebuild',
    title: 'Rebuild & Conquer',
    description: 'Trade away your 3 best players and still win the premiership within 4 seasons.',
    rules: [
      'Delist or trade your 3 highest-rated players within the first off-season',
      'Win the premiership within 4 seasons of starting the challenge',
      'Challenge is on the honour system',
    ],
    legacyReward: 120,
    targetSeasons: 4,
  },
]

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function initialLegacyState(): LegacyState {
  return {
    totalPoints: 0,
    breakdown: {
      premierships: 0,
      grandFinals: 0,
      finalsAppearances: 0,
      top4Finishes: 0,
      ladderLeads: 0,
      brownlows: 0,
      colemanMedals: 0,
      bestAndFairest: 0,
      allAustralians: 0,
      draftSuccesses: 0,
      financialSurpluses: 0,
      winStreakBonus: 0,
      careerGoals: 0,
      challenges: 0,
      total: 0,
    },
    dynastyHistory: [],
    boardExpectation: {
      minLadderPosition: 18,
      requireFinals: false,
      requireTopFour: false,
      requireGrandFinal: false,
      requirePremiership: false,
      mood: 'neutral',
      pressureLevel: 20,
      consecutiveExpectationsMet: 0,
      message: 'The board expects you to show some improvement in your first season.',
    },
    activeChallenge: null,
    pendingChallengePrompt: false,
    seasonsManaged: 0,
    premiershipsWon: 0,
    allTimeWins: 0,
    allTimeLosses: 0,
    allTimeDraws: 0,
    longestWinStreak: 0,
    currentWinStreak: 0,
    longestFinalsStreak: 0,
    currentFinalsStreak: 0,
  }
}

// ---------------------------------------------------------------------------
// Season-end params
// ---------------------------------------------------------------------------

export interface SeasonEndParams {
  clubId: string
  year: number
  seasonNumber: number         // 1-indexed
  ladderPosition: number
  wins: number
  losses: number
  draws: number
  percentage: number
  finalPosition: FinalPosition
  brownlowWinnerClubId: string | null
  colemanWinnerClubId: string | null
  clubBFWinnerId: string | null       // playerId of club B&F winner (own club only)
  allAustralianPlayerIdsFromClub: string[]
  draftedPlayersNowAbove80: number    // players drafted by user now with OVR >= 80
  financialSurplusThisSeason: boolean
  currentWinStreak: number            // streak entering post-season (already computed)
  longestWinStreakThisSeason: number
  totalMatchesPlayed: number
}

// ---------------------------------------------------------------------------
// Calculate legacy points for one season
// ---------------------------------------------------------------------------

export function calculateSeasonLegacyPoints(
  params: SeasonEndParams,
): { earned: Omit<LegacyPointsBreakdown, 'careerGoals' | 'challenges' | 'total'>; notableEvents: string[] } {
  const b: Omit<LegacyPointsBreakdown, 'careerGoals' | 'challenges' | 'total'> = {
    premierships: 0,
    grandFinals: 0,
    finalsAppearances: 0,
    top4Finishes: 0,
    ladderLeads: 0,
    brownlows: 0,
    colemanMedals: 0,
    bestAndFairest: 0,
    allAustralians: 0,
    draftSuccesses: 0,
    financialSurpluses: 0,
    winStreakBonus: 0,
  }
  const notableEvents: string[] = []

  // Final position points
  switch (params.finalPosition) {
    case 'premiers':
      b.premierships = 100
      notableEvents.push('Premiership winner 🏆')
      break
    case 'runner-up':
      b.grandFinals = 40
      notableEvents.push('Grand Final runner-up')
      break
    case 'preliminary':
      b.finalsAppearances = 15
      notableEvents.push('Preliminary Final')
      break
    case 'semi':
      b.finalsAppearances = 10
      notableEvents.push('Semi-Final appearance')
      break
    case 'elimination':
      b.finalsAppearances = 5
      notableEvents.push('Finals appearance')
      break
    case 'missed':
      break
  }

  // Ladder position points
  if (params.ladderPosition === 1) {
    b.ladderLeads = 20
    notableEvents.push('Finished #1 on the ladder')
  } else if (params.ladderPosition <= 4) {
    b.top4Finishes = 10
    notableEvents.push(`Top 4 finish (${params.ladderPosition}th)`)
  }

  // Awards from own club
  if (params.brownlowWinnerClubId === params.clubId) {
    b.brownlows = 10
    notableEvents.push('Club Brownlow medallist')
  }
  if (params.colemanWinnerClubId === params.clubId) {
    b.colemanMedals = 8
    notableEvents.push('Club Coleman medallist')
  }
  if (params.clubBFWinnerId) {
    b.bestAndFairest = 5
    notableEvents.push('Club Best & Fairest awarded')
  }

  // All-Australian
  if (params.allAustralianPlayerIdsFromClub.length > 0) {
    b.allAustralians = params.allAustralianPlayerIdsFromClub.length * 3
    notableEvents.push(`${params.allAustralianPlayerIdsFromClub.length} All-Australian selection${params.allAustralianPlayerIdsFromClub.length > 1 ? 's' : ''}`)
  }

  // Draft development
  if (params.draftedPlayersNowAbove80 > 0) {
    b.draftSuccesses = params.draftedPlayersNowAbove80 * 2
    notableEvents.push(`${params.draftedPlayersNowAbove80} draft pick${params.draftedPlayersNowAbove80 > 1 ? 's' : ''} reached 80+ OVR`)
  }

  // Financial surplus
  if (params.financialSurplusThisSeason) {
    b.financialSurpluses = 3
  }

  // Win streak bonus (1 pt per game beyond 5 in a streak ≥ 6)
  if (params.longestWinStreakThisSeason >= 6) {
    b.winStreakBonus = params.longestWinStreakThisSeason - 5
    notableEvents.push(`${params.longestWinStreakThisSeason}-game win streak`)
  }

  return { earned: b, notableEvents }
}

// ---------------------------------------------------------------------------
// Board expectation escalation
// ---------------------------------------------------------------------------

export function escalateBoardExpectation(
  prev: BoardExpectation,
  history: DynastySeasonEntry[],
): BoardExpectation {
  if (history.length === 0) return prev

  const finalsStreak = countTrailingFinals(history)
  const top4Streak = countTrailingTop4(history)
  const gfStreak = countTrailingGF(history)
  const premStreak = countTrailingPrems(history)

  let minLadderPosition = prev.minLadderPosition
  let requireFinals = prev.requireFinals
  let requireTopFour = prev.requireTopFour
  let requireGrandFinal = prev.requireGrandFinal
  let requirePremiership = prev.requirePremiership
  let pressureLevel = prev.pressureLevel
  let consecutiveExpectationsMet = prev.consecutiveExpectationsMet

  const latestEntry = history[history.length - 1]!
  const metThisSeason = latestEntry.boardMet

  if (metThisSeason) {
    consecutiveExpectationsMet++
    pressureLevel = Math.max(0, pressureLevel - 5)
  } else {
    consecutiveExpectationsMet = 0
    pressureLevel = Math.min(100, pressureLevel + 15)
  }

  // Ladder position: tighten after 3 consecutive finals
  if (finalsStreak >= 3 && !requireFinals) {
    requireFinals = true
    minLadderPosition = 12
  }
  if (top4Streak >= 2 && !requireTopFour) {
    requireTopFour = true
    minLadderPosition = 8
  }
  if (top4Streak >= 3) {
    minLadderPosition = Math.min(minLadderPosition, 6)
  }
  if (gfStreak >= 1 && !requireGrandFinal) {
    requireGrandFinal = true
    minLadderPosition = 4
  }
  if (premStreak >= 1 && !requirePremiership) {
    requirePremiership = true
    minLadderPosition = 4
    pressureLevel = Math.min(100, pressureLevel + 10)
  }
  // Relax if we missed finals (one step back)
  if (latestEntry.finalPosition === 'missed' && requireGrandFinal) {
    requireGrandFinal = false
  }
  if (latestEntry.finalPosition === 'missed' && requireTopFour) {
    requireTopFour = false
  }

  const mood = computeMood(consecutiveExpectationsMet, pressureLevel, metThisSeason)
  const message = buildBoardMessage({ requireFinals, requireTopFour, requireGrandFinal, requirePremiership, minLadderPosition, mood, metThisSeason })

  return {
    minLadderPosition,
    requireFinals,
    requireTopFour,
    requireGrandFinal,
    requirePremiership,
    mood,
    pressureLevel,
    consecutiveExpectationsMet,
    message,
  }
}

function countTrailingFinals(history: DynastySeasonEntry[]): number {
  let count = 0
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.finalPosition !== 'missed') count++
    else break
  }
  return count
}

function countTrailingTop4(history: DynastySeasonEntry[]): number {
  let count = 0
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.ladderPosition <= 4) count++
    else break
  }
  return count
}

function countTrailingGF(history: DynastySeasonEntry[]): number {
  let count = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const fp = history[i]!.finalPosition
    if (fp === 'premiers' || fp === 'runner-up') count++
    else break
  }
  return count
}

function countTrailingPrems(history: DynastySeasonEntry[]): number {
  let count = 0
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.finalPosition === 'premiers') count++
    else break
  }
  return count
}

function computeMood(
  consecutive: number,
  pressure: number,
  metThisSeason: boolean,
): BoardMood {
  if (!metThisSeason && pressure >= 70) return 'angry'
  if (!metThisSeason && pressure >= 50) return 'concerned'
  if (consecutive >= 3) return 'ecstatic'
  if (consecutive >= 1) return 'satisfied'
  return 'neutral'
}

function buildBoardMessage(opts: {
  requireFinals: boolean
  requireTopFour: boolean
  requireGrandFinal: boolean
  requirePremiership: boolean
  minLadderPosition: number
  mood: BoardMood
  metThisSeason: boolean
}): string {
  if (opts.requirePremiership) {
    return opts.metThisSeason
      ? "Outstanding. The board expects nothing less than another flag next season."
      : "The board expects a premiership. Nothing else will do."
  }
  if (opts.requireGrandFinal) {
    return opts.metThisSeason
      ? "A Grand Final appearance is the minimum standard now. Keep it up."
      : "The board demands a Grand Final appearance next season."
  }
  if (opts.requireTopFour) {
    return opts.metThisSeason
      ? "Top 4 is the floor. The board is pleased but wants more."
      : "A Top 4 finish is the board's minimum expectation."
  }
  if (opts.requireFinals) {
    return opts.metThisSeason
      ? "Finals qualification is expected. Build on this result."
      : "The board expects finals football next season."
  }
  return opts.metThisSeason
    ? "The board is satisfied with your progress."
    : "Show improvement. The board is watching."
}

// ---------------------------------------------------------------------------
// Check if board expectation was met
// ---------------------------------------------------------------------------

function didMeetBoardExpectation(
  expectation: BoardExpectation,
  ladderPosition: number,
  finalPosition: FinalPosition,
): boolean {
  if (ladderPosition > expectation.minLadderPosition) return false
  if (expectation.requireFinals && finalPosition === 'missed') return false
  if (expectation.requireTopFour && ladderPosition > 4) return false
  if (expectation.requireGrandFinal && finalPosition !== 'premiers' && finalPosition !== 'runner-up') return false
  if (expectation.requirePremiership && finalPosition !== 'premiers') return false
  return true
}

// ---------------------------------------------------------------------------
// Main season-end processing
// ---------------------------------------------------------------------------

export function processSeasonEndLegacy(
  prev: LegacyState,
  params: SeasonEndParams,
): LegacyState {
  const { earned, notableEvents } = calculateSeasonLegacyPoints(params)

  // Compute season total from earned breakdown
  const seasonPts =
    earned.premierships +
    earned.grandFinals +
    earned.finalsAppearances +
    earned.top4Finishes +
    earned.ladderLeads +
    earned.brownlows +
    earned.colemanMedals +
    earned.bestAndFairest +
    earned.allAustralians +
    earned.draftSuccesses +
    earned.financialSurpluses +
    earned.winStreakBonus

  const boardMet = didMeetBoardExpectation(prev.boardExpectation, params.ladderPosition, params.finalPosition)

  // Compute new win/loss/draw streaks
  const newAllTimeWins = prev.allTimeWins + params.wins
  const newAllTimeLosses = prev.allTimeLosses + params.losses
  const newAllTimeDraws = prev.allTimeDraws + params.draws
  const newLongestWinStreak = Math.max(prev.longestWinStreak, params.longestWinStreakThisSeason)

  // Finals streaks
  const inFinals = params.finalPosition !== 'missed'
  const newCurrentFinalsStreak = inFinals ? prev.currentFinalsStreak + 1 : 0
  const newLongestFinalsStreak = Math.max(prev.longestFinalsStreak, newCurrentFinalsStreak)

  // Active challenge: check completion
  let activeChallenge = prev.activeChallenge
  let challengePts = 0
  if (activeChallenge && activeChallenge.status === 'active') {
    const completed = evaluateChallengeCompletion(activeChallenge, params, prev)
    if (completed) {
      activeChallenge = { ...activeChallenge, status: 'completed', completedSeason: params.seasonNumber }
      challengePts = activeChallenge.legacyReward
      notableEvents.push(`Challenge completed: ${activeChallenge.title} (+${challengePts} pts)`)
    } else if (params.seasonNumber > activeChallenge.targetSeason) {
      activeChallenge = { ...activeChallenge, status: 'abandoned' }
    }
  }

  // Cumulative breakdown
  const newBreakdown: LegacyPointsBreakdown = {
    premierships: prev.breakdown.premierships + earned.premierships,
    grandFinals: prev.breakdown.grandFinals + earned.grandFinals,
    finalsAppearances: prev.breakdown.finalsAppearances + earned.finalsAppearances,
    top4Finishes: prev.breakdown.top4Finishes + earned.top4Finishes,
    ladderLeads: prev.breakdown.ladderLeads + earned.ladderLeads,
    brownlows: prev.breakdown.brownlows + earned.brownlows,
    colemanMedals: prev.breakdown.colemanMedals + earned.colemanMedals,
    bestAndFairest: prev.breakdown.bestAndFairest + earned.bestAndFairest,
    allAustralians: prev.breakdown.allAustralians + earned.allAustralians,
    draftSuccesses: prev.breakdown.draftSuccesses + earned.draftSuccesses,
    financialSurpluses: prev.breakdown.financialSurpluses + earned.financialSurpluses,
    winStreakBonus: prev.breakdown.winStreakBonus + earned.winStreakBonus,
    careerGoals: prev.breakdown.careerGoals,
    challenges: prev.breakdown.challenges + challengePts,
    total: prev.totalPoints + seasonPts + challengePts,
  }
  newBreakdown.total = newBreakdown.total // already set

  const newTotalPoints = prev.totalPoints + seasonPts + challengePts
  const newPremershipsWon = prev.premiershipsWon + (params.finalPosition === 'premiers' ? 1 : 0)

  const newDynastyEntry: DynastySeasonEntry = {
    seasonNumber: params.seasonNumber,
    year: params.year,
    clubId: params.clubId,
    ladderPosition: params.ladderPosition,
    wins: params.wins,
    losses: params.losses,
    draws: params.draws,
    percentage: params.percentage,
    finalPosition: params.finalPosition,
    legacyPointsEarned: seasonPts + challengePts,
    cumulativeLegacyPoints: newTotalPoints,
    boardMet,
    boardMood: prev.boardExpectation.mood,
    notableEvents,
  }

  const newDynastyHistory = [...prev.dynastyHistory, newDynastyEntry]

  const newBoardExpectation = escalateBoardExpectation(prev.boardExpectation, newDynastyHistory)

  const pendingChallengePrompt =
    params.finalPosition === 'premiers' &&
    (!activeChallenge || activeChallenge.status !== 'active')

  return {
    totalPoints: newTotalPoints,
    breakdown: newBreakdown,
    dynastyHistory: newDynastyHistory,
    boardExpectation: newBoardExpectation,
    activeChallenge: activeChallenge?.status === 'completed' ? null : activeChallenge,
    pendingChallengePrompt,
    seasonsManaged: prev.seasonsManaged + 1,
    premiershipsWon: newPremershipsWon,
    allTimeWins: newAllTimeWins,
    allTimeLosses: newAllTimeLosses,
    allTimeDraws: newAllTimeDraws,
    longestWinStreak: newLongestWinStreak,
    currentWinStreak: params.currentWinStreak,
    longestFinalsStreak: newLongestFinalsStreak,
    currentFinalsStreak: newCurrentFinalsStreak,
  }
}

function evaluateChallengeCompletion(
  challenge: ActiveChallenge,
  params: SeasonEndParams,
  prev: LegacyState,
): boolean {
  switch (challenge.id) {
    case 'back-to-back':
      return params.finalPosition === 'premiers'
    case 'three-peat':
      return params.finalPosition === 'premiers' &&
        prev.dynastyHistory.length > 0 &&
        prev.dynastyHistory[prev.dynastyHistory.length - 1]!.finalPosition === 'premiers'
    case 'dynasty-five':
      return (prev.premiershipsWon + (params.finalPosition === 'premiers' ? 1 : 0)) >= 5
    case 'youth-only':
    case 'low-budget':
    case 'rebuild':
      // Honour system — only completes if they win the premiership within target
      return params.finalPosition === 'premiers' && params.seasonNumber <= challenge.targetSeason
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Career objectives generation
// ---------------------------------------------------------------------------

const OBJECTIVE_BANK: Array<{
  key: string
  title: string
  description: string
  scope: 'season' | 'multi-season'
  targetFn: (legacy: LegacyState) => number
  deadlineSeasons: number
  reward: number
  condition: (legacy: LegacyState, entry: DynastySeasonEntry) => number
}> = [
  {
    key: 'win-premiership',
    title: 'Flag Chaser',
    description: 'Win a premiership.',
    scope: 'season',
    targetFn: () => 1,
    deadlineSeasons: 3,
    reward: 30,
    condition: (_l, e) => e.finalPosition === 'premiers' ? 1 : 0,
  },
  {
    key: 'top4-streak',
    title: 'Consistent Contender',
    description: 'Finish in the top 4 for 3 consecutive seasons.',
    scope: 'multi-season',
    targetFn: () => 3,
    deadlineSeasons: 5,
    reward: 25,
    condition: (_l, e) => e.ladderPosition <= 4 ? 1 : 0,
  },
  {
    key: 'finals-streak',
    title: 'Finals Regular',
    description: 'Make the finals 4 years running.',
    scope: 'multi-season',
    targetFn: () => 4,
    deadlineSeasons: 6,
    reward: 20,
    condition: (_l, e) => e.finalPosition !== 'missed' ? 1 : 0,
  },
  {
    key: 'win-150-games',
    title: 'Century of Wins',
    description: 'Win 150 games as manager.',
    scope: 'multi-season',
    targetFn: () => 150,
    deadlineSeasons: 12,
    reward: 40,
    condition: (l, _e) => l.allTimeWins,
  },
  {
    key: 'win-200-games',
    title: 'Double Century',
    description: 'Win 200 games as manager.',
    scope: 'multi-season',
    targetFn: () => 200,
    deadlineSeasons: 18,
    reward: 50,
    condition: (l, _e) => l.allTimeWins,
  },
  {
    key: 'three-premierships',
    title: 'Triple Crown',
    description: 'Win 3 premierships.',
    scope: 'multi-season',
    targetFn: () => 3,
    deadlineSeasons: 10,
    reward: 40,
    condition: (l, _e) => l.premiershipsWon,
  },
  {
    key: 'ladder-leader',
    title: 'Minor Premiership',
    description: 'Finish #1 on the ladder.',
    scope: 'season',
    targetFn: () => 1,
    deadlineSeasons: 3,
    reward: 15,
    condition: (_l, e) => e.ladderPosition === 1 ? 1 : 0,
  },
  {
    key: '500-pts',
    title: 'Legacy Builder',
    description: 'Reach 500 total legacy points.',
    scope: 'multi-season',
    targetFn: () => 500,
    deadlineSeasons: 10,
    reward: 30,
    condition: (l, _e) => l.totalPoints,
  },
  {
    key: '1000-pts',
    title: 'Dynasty Lord',
    description: 'Reach 1,000 total legacy points.',
    scope: 'multi-season',
    targetFn: () => 1000,
    deadlineSeasons: 20,
    reward: 50,
    condition: (l, _e) => l.totalPoints,
  },
  {
    key: 'gf-appearance',
    title: 'Grand Finalist',
    description: 'Reach the Grand Final.',
    scope: 'season',
    targetFn: () => 1,
    deadlineSeasons: 3,
    reward: 15,
    condition: (_l, e) => e.finalPosition === 'premiers' || e.finalPosition === 'runner-up' ? 1 : 0,
  },
]

export function generateNewCareerObjectives(
  legacy: LegacyState,
  existing: CareerObjective[],
  currentYear: number,
): CareerObjective[] {
  const active = existing.filter((o) => o.status === 'active')
  if (active.length >= 5) return []

  const usedTypes = new Set(existing.map((o) => o.type))
  const slotsToFill = Math.max(0, 3 - active.length)

  const candidates = OBJECTIVE_BANK.filter((o) => {
    if (usedTypes.has(o.key)) return false
    // Don't generate objectives already achieved (too easy)
    if (o.key === 'win-150-games' && legacy.allTimeWins >= 150) return false
    if (o.key === 'win-200-games' && legacy.allTimeWins >= 200) return false
    if (o.key === 'three-premierships' && legacy.premiershipsWon >= 3) return false
    if (o.key === '500-pts' && legacy.totalPoints >= 500) return false
    if (o.key === '1000-pts' && legacy.totalPoints >= 1000) return false
    return true
  })

  const picked = candidates.slice(0, slotsToFill)

  return picked.map((o) => ({
    id: `obj-${o.key}-${currentYear}`,
    type: o.key,
    title: o.title,
    description: o.description,
    scope: o.scope,
    assignedYear: currentYear,
    expiresYear: currentYear + o.deadlineSeasons,
    targetValue: o.targetFn(legacy),
    currentValue: o.condition(legacy, legacy.dynastyHistory[legacy.dynastyHistory.length - 1] ?? {
      seasonNumber: 0, year: currentYear, clubId: '', ladderPosition: 18,
      wins: 0, losses: 0, draws: 0, percentage: 0, finalPosition: 'missed',
      legacyPointsEarned: 0, cumulativeLegacyPoints: 0, boardMet: false,
      boardMood: 'neutral', notableEvents: [],
    }),
    status: 'active' as const,
  }))
}

export function evaluateCareerObjectives(
  objectives: CareerObjective[],
  legacy: LegacyState,
  latestEntry: DynastySeasonEntry,
): CareerObjective[] {
  return objectives.map((obj) => {
    if (obj.status !== 'active') return obj

    const def = OBJECTIVE_BANK.find((b) => b.key === obj.type)
    if (!def) return obj

    const currentValue = def.condition(legacy, latestEntry)
    const completed = currentValue >= obj.targetValue
    const expired = !completed && obj.expiresYear !== undefined && latestEntry.year >= obj.expiresYear

    return {
      ...obj,
      currentValue,
      status: completed ? 'completed' : expired ? 'expired' : 'active',
      completedYear: completed ? latestEntry.year : undefined,
    }
  })
}

// ---------------------------------------------------------------------------
// Legacy rating label
// ---------------------------------------------------------------------------

export function buildLegacyRating(total: number): { label: string; colour: string } {
  if (total >= 1000) return { label: 'Legendary', colour: 'text-yellow-400' }
  if (total >= 500) return { label: 'Dynasty', colour: 'text-purple-400' }
  if (total >= 200) return { label: 'Contender', colour: 'text-blue-400' }
  if (total >= 50) return { label: 'Established', colour: 'text-green-400' }
  return { label: 'Developing', colour: 'text-gray-400' }
}

export function buildLegacyRatingBadge(total: number): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (total >= 1000) return { label: 'Legendary', variant: 'default' }
  if (total >= 500) return { label: 'Dynasty', variant: 'default' }
  if (total >= 200) return { label: 'Contender', variant: 'secondary' }
  if (total >= 50) return { label: 'Established', variant: 'secondary' }
  return { label: 'Developing', variant: 'outline' }
}

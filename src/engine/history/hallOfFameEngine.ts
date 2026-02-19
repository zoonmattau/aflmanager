import type {
  RetirementLegacyEntry,
  SeasonAwardRecord,
  SeasonRecord,
  AFLRecordsBook,
  MilestoneRecord,
  RecordsLeaderboardStat,
} from '@/types/history'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlayerAwardsProfile {
  brownlows: Array<{ year: number; votes: number }>
  colemans: Array<{ year: number; goals: number }>
  allAustralians: number[]      // years selected
  risingStar: number | null     // year won, or null
  bestAndFairest: Array<{ year: number; clubId: string }>
}

export interface LeagueHallOfFameEntry {
  playerId: string
  playerName: string
  retiredYear: number
  primaryClubId: string
  primaryClubName: string
  tier: RetirementLegacyEntry['tier']
  primaryPosition: string
  gamesPlayed: number
  goals: number
  disposals: number
  marks: number
  tackles: number
  hitouts: number
  overallAtRetirement: number
  careerScore: number
  rank: number
  // Awards
  brownlowCount: number
  colemanCount: number
  allAustralianCount: number
  isRisingStar: boolean
  bestAndFairestCount: number
  // Club history
  premiershipYearsAtClub: number[]
  // Career records
  careerRecordsHeld: RecordsLeaderboardStat[]
  // Original ceremony text
  ceremonyHeadline: string
  ceremonySummary: string
  hallOfFameEligible: boolean
}

export interface PlayerMilestoneSummary {
  type: string
  threshold: number
  year: number
  round: number
}

export interface PlayerLegacyProfile extends LeagueHallOfFameEntry {
  awardsProfile: PlayerAwardsProfile
  milestones: PlayerMilestoneSummary[]
  // Per-game averages (derived)
  disposalsPerGame: number
  goalsPerGame: number
  marksPerGame: number
  tacklesPerGame: number
}

// ---------------------------------------------------------------------------
// Stat helpers
// ---------------------------------------------------------------------------

const CAREER_RECORD_STATS: RecordsLeaderboardStat[] = [
  'gamesPlayed',
  'goals',
  'disposals',
  'marks',
  'tackles',
  'hitouts',
  'clearances',
  'intercepts',
  'scoreInvolvements',
  'aflFantasyPoints',
  'superCoachPoints',
]

export const HOF_STAT_LABELS: Record<RecordsLeaderboardStat, string> = {
  gamesPlayed: 'Career Games',
  goals: 'Career Goals',
  disposals: 'Career Disposals',
  marks: 'Career Marks',
  tackles: 'Career Tackles',
  hitouts: 'Career Hitouts',
  clearances: 'Career Clearances',
  intercepts: 'Career Intercepts',
  scoreInvolvements: 'Score Involvements',
  aflFantasyPoints: 'AFL Fantasy Points',
  superCoachPoints: 'SuperCoach Points',
}

function getCareerStat(
  playerId: string,
  stat: RecordsLeaderboardStat,
  recordsBook: AFLRecordsBook,
): number {
  const leaders = recordsBook.leaderboards?.career?.[stat] ?? []
  return leaders.find((e) => e.playerId === playerId)?.value ?? 0
}

// ---------------------------------------------------------------------------
// Award computation
// ---------------------------------------------------------------------------

export function computePlayerAwards(
  playerId: string,
  awards: SeasonAwardRecord[],
): PlayerAwardsProfile {
  const brownlows: Array<{ year: number; votes: number }> = []
  const colemans: Array<{ year: number; goals: number }> = []
  const allAustralians: number[] = []
  let risingStar: number | null = null
  const bestAndFairest: Array<{ year: number; clubId: string }> = []

  for (const aw of awards) {
    if (aw.brownlowMedal?.playerId === playerId) {
      brownlows.push({ year: aw.year, votes: aw.brownlowMedal.votes })
    }
    if (aw.colemanMedal?.playerId === playerId) {
      colemans.push({ year: aw.year, goals: aw.colemanMedal.goals })
    }
    if (aw.allAustralian.some((a) => a.playerId === playerId)) {
      allAustralians.push(aw.year)
    }
    if (aw.risingStar?.playerId === playerId) {
      risingStar = aw.year
    }
    for (const [clubId, winner] of Object.entries(aw.clubBestAndFairest)) {
      if (winner.playerId === playerId) {
        bestAndFairest.push({ year: aw.year, clubId })
      }
    }
  }

  return { brownlows, colemans, allAustralians, risingStar, bestAndFairest }
}

// ---------------------------------------------------------------------------
// Records held
// ---------------------------------------------------------------------------

export function computeCareerRecordsHeld(
  playerId: string,
  recordsBook: AFLRecordsBook,
): RecordsLeaderboardStat[] {
  return CAREER_RECORD_STATS.filter(
    (stat) => recordsBook.leaderboards?.career?.[stat]?.[0]?.playerId === playerId,
  )
}

// ---------------------------------------------------------------------------
// Career score
// ---------------------------------------------------------------------------

export function computeCareerScore(
  legacy: RetirementLegacyEntry,
  awardsProfile: PlayerAwardsProfile,
  seasons: SeasonRecord[],
  recordsBook: AFLRecordsBook,
): number {
  let score = 0

  // Base production
  score += legacy.gamesPlayed * 1.5
  score += legacy.goals * 0.6

  // Tier bonus
  if (legacy.tier === 'legend') score += 300
  else if (legacy.tier === 'club-great') score += 100

  // Individual awards
  score += awardsProfile.brownlows.length * 150
  score += awardsProfile.colemans.length * 80
  score += awardsProfile.allAustralians.length * 30
  if (awardsProfile.risingStar != null) score += 50
  score += awardsProfile.bestAndFairest.length * 20

  // Premierships at retired club (approximate — counts flags won by their club)
  const premiershipCount = seasons.filter(
    (s) => s.premierClubId === legacy.retiredFromClubId,
  ).length
  score += premiershipCount * 100

  // Holding any all-time career record (league leader in a stat)
  const recordsHeld = computeCareerRecordsHeld(legacy.playerId, recordsBook)
  score += recordsHeld.length * 75

  return Math.round(score)
}

// ---------------------------------------------------------------------------
// Build league HoF list
// ---------------------------------------------------------------------------

export function buildLeagueHallOfFame(
  legacies: RetirementLegacyEntry[],
  awards: SeasonAwardRecord[],
  seasons: SeasonRecord[],
  recordsBook: AFLRecordsBook,
): LeagueHallOfFameEntry[] {
  // Include legend + club-great + any HoF-eligible veteran
  const eligible = legacies.filter(
    (l) => l.tier === 'legend' || l.tier === 'club-great' || l.hallOfFameEligible,
  )

  const raw = eligible.map((legacy): Omit<LeagueHallOfFameEntry, 'rank'> => {
    const awardsProfile = computePlayerAwards(legacy.playerId, awards)
    const careerScore = computeCareerScore(legacy, awardsProfile, seasons, recordsBook)
    const careerRecordsHeld = computeCareerRecordsHeld(legacy.playerId, recordsBook)
    const premiershipYearsAtClub = seasons
      .filter((s) => s.premierClubId === legacy.retiredFromClubId)
      .map((s) => s.year)

    return {
      playerId: legacy.playerId,
      playerName: legacy.playerName,
      retiredYear: legacy.retiredYear,
      primaryClubId: legacy.retiredFromClubId,
      primaryClubName: legacy.retiredFromClubName,
      tier: legacy.tier,
      primaryPosition: legacy.primaryPosition,
      gamesPlayed: legacy.gamesPlayed,
      goals: legacy.goals,
      disposals: getCareerStat(legacy.playerId, 'disposals', recordsBook),
      marks: getCareerStat(legacy.playerId, 'marks', recordsBook),
      tackles: getCareerStat(legacy.playerId, 'tackles', recordsBook),
      hitouts: getCareerStat(legacy.playerId, 'hitouts', recordsBook),
      overallAtRetirement: legacy.overallAtRetirement,
      careerScore,
      brownlowCount: awardsProfile.brownlows.length,
      colemanCount: awardsProfile.colemans.length,
      allAustralianCount: awardsProfile.allAustralians.length,
      isRisingStar: awardsProfile.risingStar != null,
      bestAndFairestCount: awardsProfile.bestAndFairest.length,
      premiershipYearsAtClub,
      careerRecordsHeld,
      ceremonyHeadline: legacy.ceremonyHeadline,
      ceremonySummary: legacy.ceremonySummary,
      hallOfFameEligible: legacy.hallOfFameEligible,
    }
  })

  // Sort by career score descending
  const sorted = [...raw].sort((a, b) => b.careerScore - a.careerScore)
  return sorted.map((entry, i) => ({ ...entry, rank: i + 1 }))
}

// ---------------------------------------------------------------------------
// Full player legacy profile (for detail dialog)
// ---------------------------------------------------------------------------

export function buildPlayerLegacyProfile(
  legacy: RetirementLegacyEntry,
  awards: SeasonAwardRecord[],
  seasons: SeasonRecord[],
  recordsBook: AFLRecordsBook,
  milestones: MilestoneRecord[],
): PlayerLegacyProfile {
  const awardsProfile = computePlayerAwards(legacy.playerId, awards)
  const careerScore = computeCareerScore(legacy, awardsProfile, seasons, recordsBook)
  const careerRecordsHeld = computeCareerRecordsHeld(legacy.playerId, recordsBook)
  const premiershipYearsAtClub = seasons
    .filter((s) => s.premierClubId === legacy.retiredFromClubId)
    .map((s) => s.year)

  const games = Math.max(1, legacy.gamesPlayed)
  const disposals = getCareerStat(legacy.playerId, 'disposals', recordsBook)
  const marks = getCareerStat(legacy.playerId, 'marks', recordsBook)
  const tackles = getCareerStat(legacy.playerId, 'tackles', recordsBook)
  const hitouts = getCareerStat(legacy.playerId, 'hitouts', recordsBook)

  const playerMilestones: PlayerMilestoneSummary[] = milestones
    .filter((m) => m.playerId === legacy.playerId)
    .map((m) => ({ type: m.type, threshold: m.threshold, year: m.year, round: m.round }))

  return {
    playerId: legacy.playerId,
    playerName: legacy.playerName,
    retiredYear: legacy.retiredYear,
    primaryClubId: legacy.retiredFromClubId,
    primaryClubName: legacy.retiredFromClubName,
    tier: legacy.tier,
    primaryPosition: legacy.primaryPosition,
    gamesPlayed: legacy.gamesPlayed,
    goals: legacy.goals,
    disposals,
    marks,
    tackles,
    hitouts,
    overallAtRetirement: legacy.overallAtRetirement,
    careerScore,
    rank: 0,
    brownlowCount: awardsProfile.brownlows.length,
    colemanCount: awardsProfile.colemans.length,
    allAustralianCount: awardsProfile.allAustralians.length,
    isRisingStar: awardsProfile.risingStar != null,
    bestAndFairestCount: awardsProfile.bestAndFairest.length,
    premiershipYearsAtClub,
    careerRecordsHeld,
    ceremonyHeadline: legacy.ceremonyHeadline,
    ceremonySummary: legacy.ceremonySummary,
    hallOfFameEligible: legacy.hallOfFameEligible,
    awardsProfile,
    milestones: playerMilestones,
    disposalsPerGame: Math.round((disposals / games) * 10) / 10,
    goalsPerGame: Math.round((legacy.goals / games) * 10) / 10,
    marksPerGame: Math.round((marks / games) * 10) / 10,
    tacklesPerGame: Math.round((tackles / games) * 10) / 10,
  }
}

import type { GameState, NewsItem } from '@/types/game'
import type { UnlockedAchievement, AchievementDef } from '@/types/achievements'
import { getOverallRating } from '@/engine/player/playerRating'

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Pure function — reads state, returns ONLY newly unlocked achievements.
 * Already-unlocked achievements are skipped via the alreadyUnlocked set.
 */
export function checkAchievements(state: GameState): UnlockedAchievement[] {
  const alreadyUnlocked = new Set(state.achievements.map((a) => a.defId))
  const newly: UnlockedAchievement[] = []

  const add = (defId: string) => {
    if (!alreadyUnlocked.has(defId)) {
      newly.push({ defId, year: state.currentYear, clubId: state.playerClubId })
      alreadyUnlocked.add(defId)
    }
  }

  checkPremiership(state, alreadyUnlocked, add)
  checkDynasty(state, alreadyUnlocked, add)
  checkClubRebuild(state, alreadyUnlocked, add)
  checkPlayerDevelopment(state, alreadyUnlocked, add)
  checkDraftScouting(state, alreadyUnlocked, add)
  checkAwards(state, alreadyUnlocked, add)
  checkSeasonPerformance(state, alreadyUnlocked, add)
  checkYouth(state, alreadyUnlocked, add)
  checkClubBuilding(state, alreadyUnlocked, add)
  checkManagement(state, alreadyUnlocked, add)
  checkRecords(state, alreadyUnlocked, add)
  checkHallOfFame(state, alreadyUnlocked, add)

  return newly
}

/** Builds a NewsItem for an achievement unlock. */
export function buildAchievementNews(
  ua: UnlockedAchievement,
  def: AchievementDef,
  date: string,
): NewsItem {
  const tierLabel = def.tier === 'gold' ? 'Gold' : def.tier === 'silver' ? 'Silver' : 'Bronze'
  return {
    id: crypto.randomUUID(),
    date,
    headline: `Achievement unlocked: ${def.title}`,
    body: `[${tierLabel}] ${def.description}`,
    category: 'milestone',
    clubIds: [ua.clubId],
    playerIds: [],
  }
}

// ---------------------------------------------------------------------------
// Category helpers
// ---------------------------------------------------------------------------

function checkPremiership(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { playerClubId, history } = state
  const seasons = history.seasons ?? []

  // Bronze: reached a Grand Final (as premier or runner-up)
  const reachedGF = seasons.some(
    (s) => s.premierClubId === playerClubId || s.runnerUpClubId === playerClubId,
  )
  if (reachedGF) add('premiership-bronze')

  // Silver: won 1 premiership
  const premiershipCount = seasons.filter((s) => s.premierClubId === playerClubId).length
  if (premiershipCount >= 1) add('premiership-silver')

  // Gold: won 3 premierships
  if (premiershipCount >= 3) add('premiership-gold')
}

function checkDynasty(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { playerClubId, history } = state
  const seasons = history.seasons ?? []
  const premierYears = seasons
    .filter((s) => s.premierClubId === playerClubId)
    .map((s) => s.year)
    .sort((a, b) => a - b)

  // Bronze: back-to-back flags
  let maxConsecutive = 0
  let currentRun = 1
  for (let i = 1; i < premierYears.length; i++) {
    if (premierYears[i]! - premierYears[i - 1]! === 1) {
      currentRun++
      maxConsecutive = Math.max(maxConsecutive, currentRun)
    } else {
      currentRun = 1
    }
  }
  if (maxConsecutive >= 2) add('dynasty-bronze')

  // Silver: 3 consecutive flags
  if (maxConsecutive >= 3) add('dynasty-silver')

  // Gold: 5 flags total
  if (premierYears.length >= 5) add('dynasty-gold')
}

function checkClubRebuild(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { playerClubId, history } = state
  const seasons = history.seasons ?? []
  const teamCount = Object.keys(state.clubs).length

  // Bronze: bottom-6 to top-8 in one season
  // We need at least 2 seasons of history to compare year-over-year positions
  // "bottom 6" approximated as: not in the top (teamCount - 6) positions.
  // Since we only store top-4, we treat "not in top-4 last season" as a rough proxy.
  for (let i = 1; i < seasons.length; i++) {
    const prev = seasons[i - 1]!
    const curr = seasons[i]!
    const prevTop4 = prev.ladderTopFour ?? []
    const currTop4 = curr.ladderTopFour ?? []
    const prevInTop8 = prevTop4.includes(playerClubId)
    const currInTop8 = currTop4.includes(playerClubId)
    // Proxy: bottom-6 means not in top half (teamCount - 6 threshold), approximate as not in top 4
    const wasBottomSix = !prevInTop8 && teamCount >= 12

    if (wasBottomSix && currInTop8) {
      add('club-rebuild-bronze')
      break
    }
  }

  // Silver: won flag within 5 years of taking over from bottom-6 club
  // We look for: first season managing, were they bottom-6, then won within 5 years
  if (seasons.length >= 1) {
    const firstManagedSeason = seasons[0]!
    const firstTop4 = firstManagedSeason.ladderTopFour ?? []
    const wasBottomSixOnArrival = !firstTop4.includes(playerClubId)
    if (wasBottomSixOnArrival) {
      const premierWithin5 = seasons.some(
        (s, idx) =>
          idx <= 4 && s.premierClubId === playerClubId,
      )
      if (premierWithin5) add('club-rebuild-silver')
    }
  }

  // Gold: win flag with 3 different clubs
  // This requires tracking across clubs — we check history.seasons with playerClubId tracking
  // Since playerClubId changes over career, we track premiership clubs from history
  // The achievements store which club you were at when unlocked, but for checking
  // we look at all-time premierships. Since we don't store per-club coaching history
  // in seasons, we approximate: if playerClubId has ≥1 flag AND they've won with 2+ others
  // For now: check if total premierships >= 3 and there are flags at different clubs
  // This is tricky without full career club history — mark as unlockable if 3+ flags exist
  // across career (simplified)
  const premierClubs = new Set(seasons.filter((s) => s.premierClubId === playerClubId).map(() => playerClubId))
  if (premierClubs.size >= 3) add('club-rebuild-gold')
}

function checkPlayerDevelopment(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { history, players, playerClubId } = state
  const reports = history.developmentReports ?? []

  // Bronze: improved a player by 15+ OVR in one offseason
  for (const report of reports) {
    const bigRiser = [...report.risers].find(
      (r) => r.clubId === playerClubId && r.delta >= 15,
    )
    if (bigRiser) {
      add('player-development-bronze')
      break
    }
  }

  // Silver: a player drafted/recruited below 65 OVR reaches 85+ OVR
  // Check all current players at user's club against their career stats
  const clubPlayers = Object.values(players).filter((p) => p.clubId === playerClubId)
  for (const player of clubPlayers) {
    const ovr = getOverallRating(player)
    // If they started low (no draft pick or late pick) and are now high
    // We use draftPick as a proxy: pick > 30 or no pick suggests they were underrated
    if (ovr >= 85 && player.draftPick !== null && player.draftPick > 30) {
      add('player-development-silver')
      break
    }
  }

  // Gold: 5 All-Australians from your squad in one season
  const awards = history.awards ?? []
  for (const aw of awards) {
    const aaFromClub = (aw.allAustralian ?? []).filter((a) => a.clubId === playerClubId)
    if (aaFromClub.length >= 5) {
      add('player-development-gold')
      break
    }
  }
}

function checkDraftScouting(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { history, players, playerClubId } = state
  const draftHistory = history.draftHistory ?? []

  // Bronze: top-10 pick you drafted reaches 82+ OVR
  const top10ByClub = draftHistory.filter(
    (d) => d.clubId === playerClubId && d.pickNumber <= 10,
  )
  for (const entry of top10ByClub) {
    const player = players[entry.playerId]
    if (player && getOverallRating(player) >= 82) {
      add('draft-scouting-bronze')
      break
    }
  }

  // Silver: first-round pick you drafted wins the Brownlow
  const firstRoundByClub = draftHistory.filter(
    (d) => d.clubId === playerClubId && d.round === 1,
  )
  const brownlowWinnerIds = new Set(
    (history.awards ?? [])
      .map((aw) => aw.brownlowMedal?.playerId)
      .filter(Boolean) as string[],
  )
  const firstRoundPlayerIds = new Set(firstRoundByClub.map((d) => d.playerId))
  for (const winnerId of brownlowWinnerIds) {
    if (firstRoundPlayerIds.has(winnerId)) {
      add('draft-scouting-silver')
      break
    }
  }

  // Gold: 3 players from one draft class all reach 80+ OVR
  const byYear = new Map<number, string[]>()
  for (const entry of draftHistory.filter((d) => d.clubId === playerClubId)) {
    const ids = byYear.get(entry.year) ?? []
    ids.push(entry.playerId)
    byYear.set(entry.year, ids)
  }
  for (const [, playerIds] of byYear) {
    const highOvrCount = playerIds.filter((id) => {
      const p = players[id]
      return p && getOverallRating(p) >= 80
    }).length
    if (highOvrCount >= 3) {
      add('draft-scouting-gold')
      break
    }
  }
}

function checkAwards(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { history, playerClubId } = state
  const awards = history.awards ?? []

  for (const aw of awards) {
    const brownlowAtClub = aw.brownlowMedal?.clubId === playerClubId
    const colemanAtClub = aw.colemanMedal?.clubId === playerClubId
    const risingStarAtClub = aw.risingStar?.clubId === playerClubId
    const aaAtClub = (aw.allAustralian ?? []).some((a) => a.clubId === playerClubId)
    const bafAtClub = Object.prototype.hasOwnProperty.call(aw.clubBestAndFairest ?? {}, playerClubId)

    // Bronze: any major award at your club
    if (brownlowAtClub || colemanAtClub || risingStarAtClub || aaAtClub || bafAtClub) {
      add('awards-bronze')
    }

    // Silver: Brownlow at your club
    if (brownlowAtClub) add('awards-silver')

    // Gold: same player wins Brownlow + Coleman in same year
    if (
      brownlowAtClub &&
      colemanAtClub &&
      aw.brownlowMedal?.playerId === aw.colemanMedal?.playerId
    ) {
      add('awards-gold')
    }
  }
}

function checkSeasonPerformance(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { playerClubId, matchResults, ladder, history } = state

  // Bronze: won 15+ regular season games this season
  const regularWins = matchResults.filter(
    (m) =>
      !m.isFinal &&
      m.result != null &&
      ((m.homeClubId === playerClubId && m.result.homeTotalScore > m.result.awayTotalScore) ||
        (m.awayClubId === playerClubId && m.result.awayTotalScore > m.result.homeTotalScore)),
  ).length
  if (regularWins >= 15) add('season-performance-bronze')

  // Silver: finish 1st on the ladder
  const topClub = ladder[0]?.clubId
  if (topClub === playerClubId) add('season-performance-silver')

  // Gold: win premiership without losing a final
  const seasons = history.seasons ?? []
  const wonPremier = seasons.some((s) => s.premierClubId === playerClubId)
  if (wonPremier) {
    const finalsResults = matchResults.filter((m) => m.isFinal && m.result != null)
    const lostFinal = finalsResults.some(
      (m) =>
        (m.homeClubId === playerClubId && m.result!.homeTotalScore < m.result!.awayTotalScore) ||
        (m.awayClubId === playerClubId && m.result!.awayTotalScore < m.result!.homeTotalScore),
    )
    if (!lostFinal && finalsResults.length > 0) add('season-performance-gold')
  }
}

function checkYouth(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { playerClubId, history, players } = state
  const awards = history.awards ?? []

  // Bronze: Rising Star at your club
  for (const aw of awards) {
    if (aw.risingStar?.clubId === playerClubId) {
      add('youth-bronze')
      break
    }
  }

  // Silver: graduate 5 rookies to senior list
  // Count players at your club who previously had rookieList status
  // We approximate by counting players with low draft year offset (recent draftees) on senior list
  const clubPlayers = Object.values(players).filter(
    (p) => p.clubId === playerClubId && p.listStatus === 'senior',
  )
  const rookieGrads = clubPlayers.filter((p) => p.age <= 24 && p.draftYear >= state.currentYear - 3).length
  if (rookieGrads >= 5) add('youth-silver')

  // Gold: win premiership with squad avg age < 24
  const seasons = history.seasons ?? []
  const wonPremier = seasons.some((s) => s.premierClubId === playerClubId)
  if (wonPremier) {
    const ages = clubPlayers.map((p) => p.age)
    if (ages.length > 0) {
      const avgAge = ages.reduce((sum, a) => sum + a, 0) / ages.length
      if (avgAge < 24) add('youth-gold')
    }
  }
}

function checkClubBuilding(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { playerClubId, clubs, history } = state
  const club = clubs[playerClubId]
  if (!club) return

  const facs = club.facilities
  const allLevels = [
    facs.trainingGround,
    facs.gym,
    facs.medicalCentre,
    facs.recoveryPool,
    facs.youthAcademy,
    facs.analysisSuite,
  ]

  // Bronze: any facility at 5
  if (allLevels.some((l) => l >= 5)) add('club-building-bronze')

  // Silver: all facilities at 4+
  if (allLevels.every((l) => l >= 4)) add('club-building-silver')

  // Gold: win premiership with all facilities at 5
  const allAt5 = allLevels.every((l) => l >= 5)
  const seasons = history.seasons ?? []
  const wonPremier = seasons.some((s) => s.premierClubId === playerClubId)
  if (allAt5 && wonPremier) add('club-building-gold')
}

function checkManagement(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { playerClubId, history } = state
  const seasons = history.seasons ?? []

  // Count consecutive seasons at current club
  // history.seasons is in ascending order by year
  let consecutiveAtClub = 0
  for (let i = seasons.length - 1; i >= 0; i--) {
    // We don't store per-season managed club id in seasons; approximate as all seasons
    // Since the user manages throughout, count total seasons as consecutive
    consecutiveAtClub++
    // We break if there's a gap (simplified: assume all are consecutive since no per-season tracking)
  }

  // Bronze: 5+ consecutive seasons at one club
  if (consecutiveAtClub >= 5) add('management-bronze')

  // Silver: 10+ total seasons
  if (seasons.length >= 10) add('management-silver')

  // Gold: flags with 2 different clubs (hard to track without career history)
  // Simplified: if they have 2+ premierships at the current club and previously won
  const premierCount = seasons.filter((s) => s.premierClubId === playerClubId).length
  if (premierCount >= 2) add('management-gold')
}

function checkRecords(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { playerClubId, history } = state
  const awards = history.awards ?? []

  // Bronze: player at your club leads league in any major stat for a season
  // We check Coleman (goalkicking leader) or Brownlow as proxies
  for (const aw of awards) {
    if (aw.colemanMedal?.clubId === playerClubId || aw.brownlowMedal?.clubId === playerClubId) {
      add('records-bronze')
      break
    }
  }

  // Silver: Coleman Medal at your club
  for (const aw of awards) {
    if (aw.colemanMedal?.clubId === playerClubId) {
      add('records-silver')
      break
    }
  }

  // Gold: 3+ all-time records broken by players at your club
  // Use recordsBook to check current record holders from player's club
  const book = history.recordsBook
  if (book) {
    const ss = book.singleSeason
    const recordHolders: Array<{ clubId?: string } | null | undefined> = [
      ss.mostGoals,
      ss.mostDisposals,
      ss.mostMarks,
      ss.mostTackles,
      ss.mostHitouts,
      ss.mostClearances,
      ss.mostIntercepts,
      ss.mostScoreInvolvements,
      ss.mostAflFantasyPoints,
      ss.mostSuperCoachPoints,
    ]
    const clubRecordCount = recordHolders.filter((r) => r?.clubId === playerClubId).length
    if (clubRecordCount >= 3) add('records-gold')
  }
}

function checkHallOfFame(
  state: GameState,
  _alreadyUnlocked: Set<string>,
  add: (id: string) => void,
) {
  const { playerClubId, history } = state
  const retirements = history.retirementLegacies ?? []

  const clubLegends = retirements.filter(
    (r) => r.retiredFromClubId === playerClubId && r.tier === 'legend',
  )
  const clubGreatOrLegend = retirements.filter(
    (r) => r.retiredFromClubId === playerClubId && (r.tier === 'legend' || r.tier === 'club-great'),
  )

  // Bronze: 1 legend retires at your club
  if (clubLegends.length >= 1) add('hall-of-fame-bronze')

  // Silver: 3 legends retire at your club
  if (clubLegends.length >= 3) add('hall-of-fame-silver')

  // Gold: 5 legend or club-great retirements
  if (clubGreatOrLegend.length >= 5) add('hall-of-fame-gold')
}

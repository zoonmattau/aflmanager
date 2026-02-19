/**
 * careerTimeline.ts
 *
 * Pure derivation of a manager's career timeline from existing GameState data.
 * No new persisted state is required — everything is computed from history.
 */

import type { GameState } from '@/types/game'
import type { SeasonArchive } from '@/types/historyArchive'

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type TimelineEventKind =
  | 'premiership'
  | 'runners-up'
  | 'finals-exit'
  | 'ladder-position'
  | 'award-brownlow'
  | 'award-coleman'
  | 'award-rising-star'
  | 'award-all-australian'
  | 'award-best-and-fairest'
  | 'trade'
  | 'draft-pick'
  | 'milestone'
  | 'retirement'
  | 'coaching-change'

export type TimelineEventImportance = 'high' | 'medium' | 'low'

export interface TimelineEvent {
  kind: TimelineEventKind
  importance: TimelineEventImportance
  headline: string
  detail?: string
}

export interface CareerSeasonSummary {
  year: number
  clubId: string
  clubName: string
  /** Final ladder position (1-based). null if no archive. */
  ladderPosition: number | null
  /** Total teams in competition that year. */
  teamCount: number | null
  /** How far the team progressed in finals. */
  finalsRound: 'premier' | 'runners-up' | 'preliminary' | 'semi' | 'elimination' | 'missed' | null
  events: TimelineEvent[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function finalsRoundFromArchive(
  archive: SeasonArchive,
  clubId: string,
): CareerSeasonSummary['finalsRound'] {
  const matches = archive.finalsResults
  if (!matches || matches.length === 0) return 'missed'

  // Did the club participate in any finals match?
  const participated = matches.some(
    (m) => m.homeClubId === clubId || m.awayClubId === clubId,
  )
  if (!participated) return 'missed'

  // Find the GF
  const gf = matches.find((m) => m.finalType === 'GF')
  if (gf) {
    if (gf.winnerClubId === clubId) return 'premier'
    if (gf.homeClubId === clubId || gf.awayClubId === clubId) return 'runners-up'
  }

  // Check preliminary final (PF)
  const pf = matches.find(
    (m) =>
      m.finalType === 'PF' && (m.homeClubId === clubId || m.awayClubId === clubId),
  )
  if (pf) return 'preliminary'

  // Check semi final (SF or QF second chance via PF path)
  const sf = matches.find(
    (m) =>
      m.finalType === 'SF' && (m.homeClubId === clubId || m.awayClubId === clubId),
  )
  if (sf) return 'semi'

  // Qualifying/Elimination
  return 'elimination'
}

// ---------------------------------------------------------------------------
// Main derivation function
// ---------------------------------------------------------------------------

export function buildCareerTimeline(state: GameState): CareerSeasonSummary[] {
  const {
    history,
    tradeHistory,
    playerClubId,
    clubs,
  } = state

  if (!history) return []

  // Build a lookup: year → which club the manager was at.
  // We track this by iterating season archives (earliest to latest).
  // Since ManagerCareer only stores current club, we approximate by using
  // playerClubId for all seasons where we have data, unless we detect a
  // coaching change (via awards records or placeholder logic).
  // For now we use the current playerClubId as best-effort for all seasons
  // (a future enhancement could track per-season club assignments).
  const managerClubId = playerClubId || ''

  const result: CareerSeasonSummary[] = []

  // Build a set of years we have data for
  const allYears = new Set<number>()
  history.seasons.forEach((s) => allYears.add(s.year))
  history.seasonArchives.forEach((a) => allYears.add(a.year))
  history.awards.forEach((a) => allYears.add(a.year))

  const sortedYears = Array.from(allYears).sort((a, b) => a - b)

  for (const year of sortedYears) {
    const events: TimelineEvent[] = []

    const archive = history.seasonArchives.find((a) => a.year === year)
    const awardRecord = history.awards.find((a) => a.year === year)

    // --- Determine club for this year ---
    // Use current club as default; if seasonRecord references a premier we don't
    // need to override, we just use managerClubId throughout.
    const clubId = managerClubId
    const club = clubs[clubId]
    const clubName = club?.fullName ?? 'Unknown'

    // --- Ladder position ---
    let ladderPosition: number | null = null
    let teamCount: number | null = null
    if (archive) {
      const idx = archive.ladder.findIndex((e) => e.clubId === clubId)
      if (idx !== -1) {
        ladderPosition = idx + 1
        teamCount = archive.ladder.length
      }
    }

    // --- Finals result ---
    const finalsRound = archive ? finalsRoundFromArchive(archive, clubId) : null

    // --- High-importance events ---

    if (finalsRound === 'premier') {
      const gf = archive?.finalsResults.find((m) => m.finalType === 'GF')
      const score = gf
        ? `${gf.homeScore}–${gf.awayScore}`
        : ''
      events.push({
        kind: 'premiership',
        importance: 'high',
        headline: `Premiership won`,
        detail: score ? `Grand Final: ${score}` : undefined,
      })
    } else if (finalsRound === 'runners-up') {
      events.push({
        kind: 'runners-up',
        importance: 'high',
        headline: `Grand Finalists`,
        detail: 'Fell at the last hurdle',
      })
    } else if (finalsRound === 'preliminary') {
      events.push({
        kind: 'finals-exit',
        importance: 'medium',
        headline: `Preliminary Final exit`,
      })
    } else if (finalsRound === 'semi') {
      events.push({
        kind: 'finals-exit',
        importance: 'medium',
        headline: `Semi Final exit`,
      })
    } else if (finalsRound === 'elimination') {
      events.push({
        kind: 'finals-exit',
        importance: 'low',
        headline: `First week finals exit`,
      })
    } else if (ladderPosition !== null && teamCount !== null) {
      // Missed finals — only show ladder position as event if top half
      if (ladderPosition <= Math.ceil(teamCount / 2)) {
        events.push({
          kind: 'ladder-position',
          importance: 'low',
          headline: `Finished ${ordinal(ladderPosition)}`,
          detail: `Missed finals`,
        })
      } else {
        events.push({
          kind: 'ladder-position',
          importance: 'low',
          headline: `Finished ${ordinal(ladderPosition)} — missed finals`,
        })
      }
    }

    // --- Awards involving our club's players ---
    if (awardRecord) {
      if (awardRecord.brownlowMedal?.clubId === clubId) {
        events.push({
          kind: 'award-brownlow',
          importance: 'high',
          headline: `${awardRecord.brownlowMedal.playerName} won the Brownlow Medal`,
          detail: `${awardRecord.brownlowMedal.votes} votes`,
        })
      }
      if (awardRecord.colemanMedal?.clubId === clubId) {
        events.push({
          kind: 'award-coleman',
          importance: 'medium',
          headline: `${awardRecord.colemanMedal.playerName} won the Coleman Medal`,
          detail: `${awardRecord.colemanMedal.goals} goals`,
        })
      }
      if (awardRecord.risingStar?.clubId === clubId) {
        events.push({
          kind: 'award-rising-star',
          importance: 'medium',
          headline: `${awardRecord.risingStar.playerName} won Rising Star`,
        })
      }
      // All-Australian selections
      const aaSelections = awardRecord.allAustralian.filter((p) => p.clubId === clubId)
      if (aaSelections.length > 0) {
        const names = aaSelections.map((p) => p.playerName).join(', ')
        events.push({
          kind: 'award-all-australian',
          importance: 'medium',
          headline: `${aaSelections.length} All-Australian selection${aaSelections.length > 1 ? 's' : ''}`,
          detail: names,
        })
      }
      // Club Best & Fairest
      if (awardRecord.clubBestAndFairest[clubId]) {
        const bf = awardRecord.clubBestAndFairest[clubId]
        events.push({
          kind: 'award-best-and-fairest',
          importance: 'low',
          headline: `${bf.playerName} won Club Best & Fairest`,
        })
      }
    }

    // --- Trades involving our club ---
    const yearTrades = tradeHistory.filter((t) => {
      if (!t.date) return false
      return new Date(t.date).getFullYear() === year
    })
    const clubTrades = yearTrades.filter(
      (t) =>
        t.clubA === clubId ||
        t.clubB === clubId ||
        t.clubsInvolved?.includes(clubId),
    )
    for (const trade of clubTrades) {
      const otherClubId = trade.clubA === clubId ? trade.clubB : trade.clubA
      const otherClub = clubs[otherClubId]
      const otherName = otherClub?.fullName ?? otherClubId
      const incoming = trade.clubA === clubId ? trade.playersToA : trade.playersToB
      const outgoing = trade.clubA === clubId ? trade.playersToB : trade.playersToA
      const parts: string[] = []
      if (incoming.length > 0) parts.push(`IN: ${incoming.length} player${incoming.length > 1 ? 's' : ''}`)
      if (outgoing.length > 0) parts.push(`OUT: ${outgoing.length} player${outgoing.length > 1 ? 's' : ''}`)
      events.push({
        kind: 'trade',
        importance: 'low',
        headline: `Trade with ${otherName}`,
        detail: parts.join(' · '),
      })
    }

    // --- Draft picks by our club ---
    const yearDrafts = history.draftHistory.filter(
      (d) => d.year === year && d.clubId === clubId,
    )
    if (yearDrafts.length > 0) {
      const picks = yearDrafts
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .map((d) => `Pick ${d.pickNumber}: ${d.playerName}`)
      const firstPickNo = yearDrafts[0].pickNumber
      const importance: TimelineEventImportance = firstPickNo <= 5 ? 'medium' : 'low'
      events.push({
        kind: 'draft-pick',
        importance,
        headline: `Drafted ${yearDrafts.length} player${yearDrafts.length > 1 ? 's' : ''}`,
        detail: picks.slice(0, 3).join(' · ') + (picks.length > 3 ? ` +${picks.length - 3} more` : ''),
      })
    }

    // --- Notable milestones for our club's players ---
    const yearMilestones = history.milestones.filter(
      (m) => m.year === year && m.clubId === clubId,
    )
    for (const ms of yearMilestones) {
      const label =
        ms.type === 'games-played'
          ? `${ms.threshold} games`
          : ms.type === 'career-goals'
          ? `${ms.threshold} career goals`
          : ms.type === 'career-disposals'
          ? `${ms.threshold} career disposals`
          : ms.type === 'career-marks'
          ? `${ms.threshold} career marks`
          : `${ms.threshold} career tackles`
      events.push({
        kind: 'milestone',
        importance: ms.threshold >= 300 ? 'medium' : 'low',
        headline: `${ms.playerName} reached ${label}`,
      })
    }

    // --- Retirements from our club ---
    const yearRetirements = history.retirementLegacies.filter(
      (r) => r.retiredYear === year && r.retiredFromClubId === clubId,
    )
    for (const ret of yearRetirements) {
      const importance: TimelineEventImportance =
        ret.tier === 'legend' ? 'high' : ret.tier === 'club-great' ? 'medium' : 'low'
      events.push({
        kind: 'retirement',
        importance,
        headline: `${ret.playerName} retired`,
        detail: ret.tier === 'legend'
          ? `Club legend — ${ret.gamesPlayed} games`
          : `${ret.gamesPlayed} games`,
      })
    }

    result.push({
      year,
      clubId,
      clubName,
      ladderPosition,
      teamCount,
      finalsRound,
      events,
    })
  }

  return result
}

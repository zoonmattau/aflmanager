import type { Match } from '@/types/match'
import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { LadderEntry } from '@/types/season'
import type { TribunalCase } from '@/types/discipline'
import type {
  MatchReport,
  MatchReportBestPlayer,
  MatchReportQuarterSummary,
  MatchReportTurningPoint,
  MatchReportInjury,
  MatchReportTribunalIncident,
} from '@/types/history'

export interface GenerateMatchReportInput {
  match: Match
  year: number
  round: number
  isFinal?: boolean
  finalType?: string
  players: Record<string, Player>
  clubs: Record<string, Club>
  ladder: LadderEntry[]
  preLadderPositions: Record<string, number>
  injuries: Array<{ playerId: string; type: string; weeksOut: number; severity: string }>
  tribunalCases: TribunalCase[]
}

function finalTypeName(ft: string): string {
  switch (ft) {
    case 'QF': return 'Qualifying Final'
    case 'EF': return 'Elimination Final'
    case 'SF': return 'Semi Final'
    case 'PF': return 'Preliminary Final'
    case 'GF': return 'Grand Final'
    default: return 'Final'
  }
}

export function generateMatchReport(input: GenerateMatchReportInput): MatchReport {
  const {
    match, year, round, isFinal, finalType,
    players, clubs, ladder, preLadderPositions, injuries, tribunalCases,
  } = input

  const result = match.result!

  const homeClub = clubs[match.homeClubId]
  const awayClub = clubs[match.awayClubId]
  const homeName = homeClub?.name ?? match.homeClubId
  const awayName = awayClub?.name ?? match.awayClubId

  const homeScore = result.homeTotalScore
  const awayScore = result.awayTotalScore
  const margin = Math.abs(homeScore - awayScore)
  const homeWon = homeScore > awayScore
  const isDraw = homeScore === awayScore
  const winnerName = isDraw ? null : homeWon ? homeName : awayName
  const loserName = isDraw ? null : homeWon ? awayName : homeName

  // ── Quarter summaries ──────────────────────────────────────────────────────
  const quarterSummaries: MatchReportQuarterSummary[] = []
  let homeCumulative = 0
  let awayCumulative = 0
  let prevHomeCumulative = 0
  let prevAwayCumulative = 0

  for (let q = 0; q < 4; q++) {
    const homeQ = result.homeScores[q] ?? { goals: 0, behinds: 0, total: 0 }
    const awayQ = result.awayScores[q] ?? { goals: 0, behinds: 0, total: 0 }
    prevHomeCumulative = homeCumulative
    prevAwayCumulative = awayCumulative
    homeCumulative += homeQ.total
    awayCumulative += awayQ.total

    const dominatingClubId =
      homeQ.total > awayQ.total ? match.homeClubId
      : awayQ.total > homeQ.total ? match.awayClubId
      : null

    let momentumShift = false
    if (q > 0) {
      const wasTrailingHome = prevHomeCumulative < prevAwayCumulative
      const wasTrailingAway = prevAwayCumulative < prevHomeCumulative
      if (wasTrailingHome && homeQ.total - awayQ.total >= 10) momentumShift = true
      if (wasTrailingAway && awayQ.total - homeQ.total >= 10) momentumShift = true
    }

    quarterSummaries.push({
      quarter: q + 1,
      homeGoals: homeQ.goals,
      homeBehinds: homeQ.behinds,
      homeScore: homeQ.total,
      awayGoals: awayQ.goals,
      awayBehinds: awayQ.behinds,
      awayScore: awayQ.total,
      homeCumulative,
      awayCumulative,
      dominatingClubId,
      momentumShift,
    })
  }

  // ── Best players ───────────────────────────────────────────────────────────
  function scoreStat(stat: (typeof result.homePlayerStats)[0]): number {
    return stat.disposals + stat.goals * 3 + stat.marks + stat.tackles + (stat.clearances ?? 0) * 1.5
  }

  function buildBestPlayers(
    statsArr: (typeof result.homePlayerStats),
    defaultClubId: string,
  ): MatchReportBestPlayer[] {
    return [...statsArr]
      .sort((a, b) => scoreStat(b) - scoreStat(a))
      .slice(0, 3)
      .map((stat) => {
        const player = players[stat.playerId]
        return {
          playerId: stat.playerId,
          playerName: player ? `${player.firstName} ${player.lastName}` : stat.playerId,
          clubId: player?.clubId ?? defaultClubId,
          disposals: stat.disposals,
          goals: stat.goals,
          marks: stat.marks,
          tackles: stat.tackles,
          fantasyPoints: stat.aflFantasyPoints ?? 0,
        }
      })
  }

  const homeBestPlayers = buildBestPlayers(result.homePlayerStats, match.homeClubId)
  const awayBestPlayers = buildBestPlayers(result.awayPlayerStats, match.awayClubId)

  // ── Turning points ─────────────────────────────────────────────────────────
  const turningPoints: MatchReportTurningPoint[] = []

  // Goal burst: 3+ goals for same club within 5 minutes
  const goalEvents = result.keyEvents.filter((e) => e.type === 'goal')
  for (const clubId of [match.homeClubId, match.awayClubId]) {
    if (turningPoints.length >= 4) break
    const clubGoals = goalEvents
      .filter((e) => e.clubId === clubId)
      .sort((a, b) => a.quarter !== b.quarter ? a.quarter - b.quarter : a.minute - b.minute)

    for (let i = 0; i < clubGoals.length - 2; i++) {
      if (turningPoints.length >= 4) break
      const g1 = clubGoals[i]
      const g3 = clubGoals[i + 2]
      if (!g1 || !g3) continue
      if (g1.quarter === g3.quarter && g3.minute - g1.minute <= 5) {
        const cn = clubs[clubId]?.name ?? clubId
        turningPoints.push({
          quarter: g1.quarter,
          minute: g1.minute,
          description: `${cn} kicked 3 straight to swing momentum`,
          type: 'goal-burst',
        })
        i += 2
      }
    }
  }

  // Injury and tactical-change events
  for (const event of result.keyEvents) {
    if (turningPoints.length >= 4) break
    if (event.type === 'injury' || event.type === 'tactical-change') {
      turningPoints.push({
        quarter: event.quarter,
        minute: event.minute,
        description: event.description,
        type: event.type === 'injury' ? 'injury' : 'tactical-change',
      })
    }
  }

  // Comeback: trailing by ≥20 at Q2, wins
  if (turningPoints.length < 4) {
    const q2 = quarterSummaries[1]
    if (q2) {
      const homeDeficit = q2.awayCumulative - q2.homeCumulative
      const awayDeficit = q2.homeCumulative - q2.awayCumulative
      if (homeDeficit >= 20 && homeWon) {
        turningPoints.push({
          quarter: 4,
          minute: 30,
          description: `${homeName} overcame a ${homeDeficit}-point deficit`,
          type: 'comeback',
        })
      } else if (awayDeficit >= 20 && !homeWon && !isDraw) {
        turningPoints.push({
          quarter: 4,
          minute: 30,
          description: `${awayName} overcame a ${awayDeficit}-point deficit`,
          type: 'comeback',
        })
      }
    }
  }

  // ── Injuries ───────────────────────────────────────────────────────────────
  const reportInjuries: MatchReportInjury[] = injuries.map((inj) => {
    const player = players[inj.playerId]
    return {
      playerId: inj.playerId,
      playerName: player ? `${player.firstName} ${player.lastName}` : inj.playerId,
      clubId: player?.clubId ?? '',
      injuryType: inj.type,
      weeksOut: inj.weeksOut,
      severity: inj.severity as MatchReportInjury['severity'],
    }
  })

  // ── Tribunal incidents ─────────────────────────────────────────────────────
  const reportTribunal: MatchReportTribunalIncident[] = tribunalCases.map((tc) => {
    const player = players[tc.playerId]
    return {
      playerId: tc.playerId,
      playerName: player ? `${player.firstName} ${player.lastName}` : tc.playerId,
      clubId: tc.clubId,
      incidentType: tc.incidentType,
      incidentSummary: tc.incidentSummary,
      recommendedWeeks: tc.recommendedWeeks,
      severity: tc.severity,
    }
  })

  // ── Coach quotes ───────────────────────────────────────────────────────────
  const isComeback = turningPoints.some((tp) => tp.type === 'comeback')
  const finalPrefix = isFinal ? 'Finals footy exposes you. ' : ''

  let winningPool: string[]
  let losingPool: string[]

  if (isDraw) {
    winningPool = [
      "Mixed emotions. We had enough to win it.",
      "We'll take the point but won't be satisfied.",
    ]
    losingPool = winningPool
  } else if (isComeback) {
    winningPool = [
      "Showed tremendous character. That's who we are.",
      "I told them at half-time – we can turn this.",
    ]
    losingPool = [
      "Disappointing – we had our chances late and didn't take them.",
      "Credit to them, but that one stings.",
    ]
  } else if (margin > 40) {
    winningPool = [
      "Really pleased with how the group executed today.",
      "The preparation was outstanding.",
    ]
    losingPool = [
      "Not good enough. We owe the fans better than that.",
      "Need to be honest with ourselves.",
    ]
  } else if (margin >= 12) {
    winningPool = [
      "A solid team performance. Lots to like.",
      "We showed why we work hard through the week.",
    ]
    losingPool = [
      "Disappointing – we had our chances late and didn't take them.",
      "Credit to them, but that one stings.",
    ]
  } else {
    winningPool = [
      "These are the games that define seasons.",
      "Never lost belief – proud of the group.",
    ]
    losingPool = [
      "Disappointing – we had our chances late and didn't take them.",
      "Credit to them, but that one stings.",
    ]
  }

  const quoteIndex = (homeScore + awayScore + margin) % winningPool.length
  const winningCoachQuote = finalPrefix + (winningPool[quoteIndex] ?? winningPool[0])
  const losingCoachQuote = finalPrefix + (losingPool[quoteIndex % losingPool.length] ?? losingPool[0])
  const coachQuotes = isDraw ? null : { winningCoachQuote, losingCoachQuote }

  // ── Crowd ──────────────────────────────────────────────────────────────────
  let crowd: MatchReport['crowd'] = null
  const simCtx = result.simulationContext
  if (simCtx) {
    const attendance = simCtx.attendance ?? 0
    const capacityPct = simCtx.capacityPct ?? 0
    const atmosphereRating: 'electric' | 'lively' | 'moderate' | 'subdued' =
      capacityPct >= 90 ? 'electric'
      : capacityPct >= 70 ? 'lively'
      : capacityPct >= 50 ? 'moderate'
      : 'subdued'
    crowd = {
      attendance,
      capacityPct,
      weather: simCtx.weather,
      groundCondition: simCtx.groundCondition,
      atmosphereRating,
    }
  }

  // ── Ladder context ─────────────────────────────────────────────────────────
  let ladderContext: MatchReport['ladderContext'] = null
  const homePosBefore = preLadderPositions[match.homeClubId] ?? 0
  const awayPosBefore = preLadderPositions[match.awayClubId] ?? 0
  const homePosAfter = (ladder.findIndex((e) => e.clubId === match.homeClubId) + 1) || 0
  const awayPosAfter = (ladder.findIndex((e) => e.clubId === match.awayClubId) + 1) || 0

  if (homePosBefore > 0 && awayPosBefore > 0 && homePosAfter > 0 && awayPosAfter > 0) {
    const homeMove = homePosBefore - homePosAfter
    let implication = ''
    if (homePosAfter === 1 && homePosBefore !== 1) {
      implication = `${homeName} move to the top of the ladder.`
    } else if (awayPosAfter === 1 && awayPosBefore !== 1) {
      implication = `${awayName} move to the top of the ladder.`
    } else if (homePosAfter <= 4 && homePosBefore > 4) {
      implication = `${homeName} move into the top four.`
    } else if (awayPosAfter <= 4 && awayPosBefore > 4) {
      implication = `${awayName} move into the top four.`
    } else if (homePosBefore <= 4 && homePosAfter > 4) {
      implication = `${homeName} fall out of the top four.`
    } else if (awayPosBefore <= 4 && awayPosAfter > 4) {
      implication = `${awayName} fall out of the top four.`
    } else if (homeMove >= 3) {
      implication = `${homeName} jump ${homeMove} places to ${ordinal(homePosAfter)}.`
    } else {
      implication = `${homeName} sit ${ordinal(homePosAfter)}, ${awayName} sit ${ordinal(awayPosAfter)}.`
    }

    ladderContext = {
      homePositionBefore: homePosBefore,
      homePositionAfter: homePosAfter,
      awayPositionBefore: awayPosBefore,
      awayPositionAfter: awayPosAfter,
      implication,
    }
  }

  // ── Narrative body ─────────────────────────────────────────────────────────
  const roundLabel = isFinal && finalType ? `the ${finalTypeName(finalType)}` : `Round ${round}`
  const bestHome = homeBestPlayers[0]
  const bestAway = awayBestPlayers[0]

  // Para 1: opener
  let opener: string
  if (isDraw) {
    opener = `An enthralling draw at ${match.venue} saw ${homeName} and ${awayName} finish level at ${homeScore}-${awayScore} in ${roundLabel}.`
  } else if (isComeback) {
    const winScore = homeWon ? homeScore : awayScore
    const loseScore = homeWon ? awayScore : homeScore
    opener = `${winnerName} produced a stunning comeback victory at ${match.venue}, defeating ${loserName} ${winScore}-${loseScore} in ${roundLabel}.`
  } else if (margin > 40) {
    opener = `A dominant ${winnerName} ran over the top of ${loserName} at ${match.venue}, winning by ${margin} points (${homeScore}-${awayScore}) in ${roundLabel}.`
  } else if (margin <= 8) {
    opener = `A nail-biting finish at ${match.venue} saw ${winnerName} hold on to defeat ${loserName} by just ${margin} points (${homeScore}-${awayScore}) in ${roundLabel}.`
  } else {
    opener = `${winnerName} defeated ${loserName} at ${match.venue} by ${margin} points (${homeScore}-${awayScore}) in ${roundLabel}.`
  }

  // Para 2: quarter flow
  const quarterFlow = quarterSummaries.map((q) => {
    const domName = q.dominatingClubId
      ? (clubs[q.dominatingClubId]?.abbreviation ?? q.dominatingClubId)
      : null
    if (!domName) return `Q${q.quarter}: Both sides level (${q.homeCumulative}-${q.awayCumulative}).`
    return `Q${q.quarter}: ${domName} had the better of the quarter, ${q.homeCumulative}-${q.awayCumulative}.`
  }).join(' ')

  // Para 3: stars
  const starParts: string[] = []
  if (bestHome) {
    starParts.push(
      `${bestHome.playerName} was best afield for ${homeName} with ${bestHome.disposals} disposals` +
      (bestHome.goals > 0 ? ` and ${bestHome.goals} goal${bestHome.goals > 1 ? 's' : ''}` : '') + '.',
    )
  }
  if (bestAway) {
    starParts.push(`For ${awayName}, ${bestAway.playerName} collected ${bestAway.disposals} disposals.`)
  }
  const starsText = starParts.join(' ')

  // Para 4: close
  const closeParts: string[] = []
  if (reportInjuries.length > 0) {
    const firstInj = reportInjuries[0]!
    closeParts.push(`${firstInj.playerName} suffered a ${firstInj.injuryType} (${firstInj.weeksOut} weeks).`)
  }
  if (reportTribunal.length > 0) {
    const firstTrib = reportTribunal[0]!
    closeParts.push(`${firstTrib.playerName} faces a tribunal hearing over a ${firstTrib.incidentType} incident.`)
  }
  if (ladderContext) {
    closeParts.push(ladderContext.implication)
  }
  const closeText = closeParts.join(' ')

  const narrativeBody = [opener, quarterFlow, starsText, closeText].filter(Boolean).join('\n\n')

  return {
    id: crypto.randomUUID(),
    matchId: match.id,
    year,
    round,
    isFinal: !!isFinal,
    finalType: finalType as MatchReport['finalType'],
    homeClubId: match.homeClubId,
    awayClubId: match.awayClubId,
    homeScore,
    awayScore,
    venue: match.venue,
    date: match.date,
    quarterSummaries,
    homeBestPlayers,
    awayBestPlayers,
    turningPoints,
    injuries: reportInjuries,
    tribunalIncidents: reportTribunal,
    coachQuotes,
    crowd,
    ladderContext,
    narrativeBody,
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

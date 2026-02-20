import type {
  TacticalEvent,
  MidMatchDecision,
  QuarterInjury,
  CoachSuggestion,
  GameplanSliders,
} from '@/types/matchEvent'
import type {
  MatchContext,
  GameplanModifiers,
} from '@/engine/match/simulateMatch'
import {
  computeGameplanModifiers,
  applyTacticalIdentityModifiers,
  applyConditionToGameplanModifiers,
  buildTacticalRuntime,
} from '@/engine/match/simulateMatch'
import type { ClubGameplan } from '@/types/club'

// ---------------------------------------------------------------------------
// Event detection
// ---------------------------------------------------------------------------

export function detectTacticalEvents(
  ctx: MatchContext,
  userClubId: string,
  quarter: number,
): TacticalEvent[] {
  const events: TacticalEvent[] = []
  const { homeScores, awayScores, currentHomeTotal, currentAwayTotal, input } = ctx
  const isHome = userClubId === input.homeClubId
  const userScore = isHome ? currentHomeTotal : currentAwayTotal
  const oppScore = isHome ? currentAwayTotal : currentHomeTotal

  // Always: quarter-break with score summary
  const qLabel = quarter === 1 ? 'Quarter Time' : quarter === 2 ? 'Half Time' : quarter === 3 ? 'Three Quarter Time' : 'Full Time'
  events.push({
    id: `qb-${quarter}`,
    type: 'quarter-break',
    quarter,
    title: qLabel,
    description: `Score: ${currentHomeTotal} - ${currentAwayTotal}`,
    urgency: 'info',
  })

  const margin = userScore - oppScore

  // Blowout: margin >= 50 against user
  if (margin <= -50) {
    events.push({
      id: `blowout-${quarter}`,
      type: 'blowout',
      quarter,
      title: 'Getting blown out',
      description: `Down by ${Math.abs(margin)} points. Consider changing tactics.`,
      urgency: 'warning',
    })
  }

  // Close game at 3QT: margin <= 18
  if (quarter === 3 && Math.abs(margin) <= 18) {
    events.push({
      id: `close-${quarter}`,
      type: 'close-game',
      quarter,
      title: 'Close game',
      description: `Only ${Math.abs(margin)} points in it heading into the last quarter.`,
      urgency: 'info',
    })
  }

  // Momentum shift: opponent 4+ goals in last Q while user <= 1
  if (homeScores.length >= 1 && awayScores.length >= 1) {
    const lastQIdx = homeScores.length - 1
    const userLastQ = isHome ? homeScores[lastQIdx] : awayScores[lastQIdx]
    const oppLastQ = isHome ? awayScores[lastQIdx] : homeScores[lastQIdx]
    if (oppLastQ.goals >= 4 && userLastQ.goals <= 1) {
      events.push({
        id: `momentum-${quarter}`,
        type: 'momentum-shift',
        quarter,
        title: 'Momentum shift',
        description: `Opponent kicked ${oppLastQ.goals} goals to ${userLastQ.goals} that quarter.`,
        urgency: 'warning',
      })
    }
  }

  // Tag-failing: tagged player gained 8+ disposals in last Q
  const userTactical = isHome ? ctx.homeTactical : ctx.awayTactical
  for (const [targetId] of userTactical.focusByTarget) {
    const startDisposals = ctx.quarterStartDisposals.get(targetId) ?? 0
    const currentStats = [...ctx.homeStats, ...ctx.awayStats].find((s) => s.playerId === targetId)
    if (!currentStats) continue
    const qDisposals = currentStats.disposals - startDisposals
    if (qDisposals >= 8) {
      events.push({
        id: `tag-fail-${quarter}-${targetId}`,
        type: 'tag-failing',
        quarter,
        title: 'Tag not working',
        description: `Tagged player had ${qDisposals} disposals that quarter.`,
        urgency: 'warning',
        relatedPlayerId: targetId,
      })
    }
  }

  return events
}

// ---------------------------------------------------------------------------
// Quarter injuries
// ---------------------------------------------------------------------------

export function rollQuarterInjuries(
  ctx: MatchContext,
  userClubId: string,
  quarter: number,
  injuryFrequency: 'low' | 'medium' | 'high' = 'medium',
): QuarterInjury[] {
  const injuries: QuarterInjury[] = []
  const isHome = userClubId === ctx.input.homeClubId
  const activePlayers = isHome ? ctx.homeActivePlayers : ctx.awayActivePlayers
  const freqMult = injuryFrequency === 'high' ? 1.5 : injuryFrequency === 'low' ? 0.6 : 1

  for (const player of activePlayers) {
    if (ctx.midMatchInjuredPlayerIds.has(player.id)) continue

    // Base ~0.3% per player per quarter
    let chance = 0.003 * freqMult
    const durability = player.hiddenAttributes.durability ?? Math.max(20, 100 - player.hiddenAttributes.injuryProneness)
    chance += ((100 - durability) / 100) * 0.004
    if (player.age > 30) chance += 0.002

    // Fatigue proxy from accumulated stats
    const stats = [...ctx.homeStats, ...ctx.awayStats].find((s) => s.playerId === player.id)
    if (stats && stats.disposals > 20) chance += 0.001

    // Aggression setting
    const aggression = isHome ? ctx.resolvedHomeGameplan.aggression : ctx.resolvedAwayGameplan.aggression
    if (aggression === 'high') chance += 0.002
    else if (aggression === 'low') chance -= 0.001

    if (!ctx.rng.chance(Math.max(0.001, Math.min(0.02, chance)))) continue

    // Roll injury type
    const types = [
      { type: 'Hamstring strain', weight: 0.33, minW: 1, maxW: 4, severity: 'minor' as const },
      { type: 'Concussion', weight: 0.12, minW: 1, maxW: 3, severity: 'moderate' as const },
      { type: 'Corked thigh', weight: 0.14, minW: 0, maxW: 1, severity: 'minor' as const },
      { type: 'Ankle sprain', weight: 0.17, minW: 2, maxW: 6, severity: 'moderate' as const },
      { type: 'Shoulder injury', weight: 0.10, minW: 2, maxW: 8, severity: 'major' as const },
      { type: 'Knee injury', weight: 0.09, minW: 4, maxW: 12, severity: 'severe' as const },
      { type: 'Back injury', weight: 0.05, minW: 2, maxW: 6, severity: 'major' as const },
    ]

    let roll = ctx.rng.next()
    let picked = types[0]
    for (const t of types) {
      roll -= t.weight
      if (roll <= 0) { picked = t; break }
    }

    const weeksOut = Math.max(1, ctx.rng.nextInt(picked.minW, picked.maxW))

    injuries.push({
      playerId: player.id,
      playerName: `${player.firstName} ${player.lastName}`,
      clubId: player.clubId,
      quarter,
      injuryType: picked.type,
      weeksOut,
      severity: picked.severity,
    })
  }

  return injuries
}

// ---------------------------------------------------------------------------
// Apply quarter injury to context
// ---------------------------------------------------------------------------

export function applyQuarterInjury(
  ctx: MatchContext,
  injury: QuarterInjury,
): void {
  const isHome = injury.clubId === ctx.input.homeClubId
  const activePlayers = isHome ? ctx.homeActivePlayers : ctx.awayActivePlayers
  const idx = activePlayers.findIndex((p) => p.id === injury.playerId)
  if (idx >= 0) {
    activePlayers.splice(idx, 1)
  }
  ctx.midMatchInjuredPlayerIds.add(injury.playerId)

  ctx.keyEvents.push({
    quarter: injury.quarter,
    minute: 0,
    type: 'injury',
    description: `${injury.playerName} injured — ${injury.injuryType} (${injury.weeksOut}w)`,
    playerId: injury.playerId,
    clubId: injury.clubId,
  })
}

// ---------------------------------------------------------------------------
// Available decisions
// ---------------------------------------------------------------------------

export function getAvailableDecisions(
  ctx: MatchContext,
  events: TacticalEvent[],
  userClubId: string,
): MidMatchDecision[] {
  const decisions: MidMatchDecision[] = []
  const isHome = userClubId === ctx.input.homeClubId
  const userScore = isHome ? ctx.currentHomeTotal : ctx.currentAwayTotal
  const oppScore = isHome ? ctx.currentAwayTotal : ctx.currentHomeTotal
  const leading = userScore > oppScore
  const trailing = userScore < oppScore

  // Always: Stay Course
  decisions.push({
    id: 'stay-course',
    type: 'stay-course',
    label: 'Stay the Course',
    description: 'Keep current tactics unchanged.',
  })

  // Tempo options
  decisions.push({
    id: 'tempo-fast',
    type: 'change-tempo',
    label: 'Fast Tempo',
    description: 'Increase pace — more possessions but slightly less accurate.',
    params: { tempo: 'fast' },
  })
  decisions.push({
    id: 'tempo-medium',
    type: 'change-tempo',
    label: 'Medium Tempo',
    description: 'Balanced pace.',
    params: { tempo: 'medium' },
  })
  decisions.push({
    id: 'tempo-slow',
    type: 'change-tempo',
    label: 'Slow Tempo',
    description: 'Slow it down — fewer possessions but more accurate.',
    params: { tempo: 'slow' },
  })

  // Aggression options
  decisions.push({
    id: 'aggression-high',
    type: 'change-aggression',
    label: 'High Aggression',
    description: 'More contested work and tackles, but higher injury risk.',
    params: { aggression: 'high' },
  })
  decisions.push({
    id: 'aggression-medium',
    type: 'change-aggression',
    label: 'Medium Aggression',
    description: 'Balanced intensity.',
    params: { aggression: 'medium' },
  })
  decisions.push({
    id: 'aggression-low',
    type: 'change-aggression',
    label: 'Low Aggression',
    description: 'Play safe — less contested but lower injury risk.',
    params: { aggression: 'low' },
  })

  // Presets
  if (leading) {
    decisions.push({
      id: 'protect-lead',
      type: 'protect-lead',
      label: 'Protect Lead',
      description: 'Switch to defensive, slow tempo, low aggression.',
    })
  }

  if (trailing) {
    decisions.push({
      id: 'chase-game',
      type: 'chase-game',
      label: 'Chase the Game',
      description: 'Switch to attacking, fast tempo, high aggression.',
    })
  }

  // Substitute
  const sub = isHome ? ctx.homeSubstitute : ctx.awaySubstitute
  if (sub && ctx.substitutesEnabled && !ctx.userSubActivated) {
    const hasInjuryEvent = events.some((e) => e.type === 'injury')
    decisions.push({
      id: 'activate-sub',
      type: 'activate-sub',
      label: hasInjuryEvent ? 'Activate Sub (Injury Cover)' : 'Activate Substitute',
      description: `Bring on ${sub.firstName} ${sub.lastName}.`,
    })
  }

  // Tag switch options (top 3 opponent disposal-getters)
  const oppStats = isHome ? ctx.awayStats : ctx.homeStats
  const oppPlayers = isHome ? ctx.awayActivePlayers : ctx.homeActivePlayers
  const topOppDisposals = [...oppStats]
    .filter((s) => oppPlayers.some((p) => p.id === s.playerId))
    .sort((a, b) => b.disposals - a.disposals)
    .slice(0, 3)

  for (const s of topOppDisposals) {
    const player = oppPlayers.find((p) => p.id === s.playerId)
    if (!player) continue
    decisions.push({
      id: `tag-switch-${player.id}`,
      type: 'tag-switch',
      label: `Tag ${player.firstName.charAt(0)}. ${player.lastName}`,
      description: `Focus defensive attention on ${player.firstName} ${player.lastName} (${s.disposals} disposals).`,
      params: { tagTargetPlayerId: player.id },
    })
  }

  // Move player forward/back
  const userPlayers = isHome ? ctx.homeActivePlayers : ctx.awayActivePlayers
  for (const player of userPlayers.slice(0, 5)) {
    decisions.push({
      id: `move-fwd-${player.id}`,
      type: 'move-player-forward',
      label: `${player.firstName.charAt(0)}. ${player.lastName} Forward`,
      description: `Push ${player.firstName} ${player.lastName} into attack.`,
      params: { movePlayerId: player.id, moveDirection: 'forward' },
    })
    decisions.push({
      id: `move-back-${player.id}`,
      type: 'move-player-back',
      label: `${player.firstName.charAt(0)}. ${player.lastName} Back`,
      description: `Drop ${player.firstName} ${player.lastName} into defense.`,
      params: { movePlayerId: player.id, moveDirection: 'back' },
    })
  }

  return decisions
}

// ---------------------------------------------------------------------------
// Apply mid-match decision
// ---------------------------------------------------------------------------

export function applyMidMatchDecision(
  ctx: MatchContext,
  decision: MidMatchDecision,
  userClubId: string,
): void {
  const isHome = userClubId === ctx.input.homeClubId
  const quarter = ctx.quartersCompleted

  if (decision.type === 'stay-course') {
    ctx.midMatchAdjustments.push({ quarter, decisionType: 'stay-course', description: 'No changes made.' })
    return
  }

  if (decision.type === 'change-tempo' && decision.params?.tempo) {
    const gameplan = isHome ? ctx.resolvedHomeGameplan : ctx.resolvedAwayGameplan
    const updated: ClubGameplan = { ...gameplan, tempo: decision.params.tempo }
    if (isHome) ctx.resolvedHomeGameplan = updated
    else ctx.resolvedAwayGameplan = updated
    rerunModifierChain(ctx, isHome)
    ctx.midMatchAdjustments.push({ quarter, decisionType: 'change-tempo', description: `Tempo changed to ${decision.params.tempo}.` })
    return
  }

  if (decision.type === 'change-aggression' && decision.params?.aggression) {
    const gameplan = isHome ? ctx.resolvedHomeGameplan : ctx.resolvedAwayGameplan
    const updated: ClubGameplan = { ...gameplan, aggression: decision.params.aggression }
    if (isHome) ctx.resolvedHomeGameplan = updated
    else ctx.resolvedAwayGameplan = updated
    rerunModifierChain(ctx, isHome)
    ctx.effectiveAggressionQuarters.push(decision.params.aggression)
    ctx.midMatchAdjustments.push({ quarter, decisionType: 'change-aggression', description: `Aggression changed to ${decision.params.aggression}.` })
    return
  }

  if (decision.type === 'protect-lead') {
    const gameplan = isHome ? ctx.resolvedHomeGameplan : ctx.resolvedAwayGameplan
    const updated: ClubGameplan = { ...gameplan, offensiveStyle: 'defensive', tempo: 'slow', aggression: 'low' }
    if (isHome) ctx.resolvedHomeGameplan = updated
    else ctx.resolvedAwayGameplan = updated
    rerunModifierChain(ctx, isHome)
    ctx.effectiveAggressionQuarters.push('low')
    ctx.midMatchAdjustments.push({ quarter, decisionType: 'protect-lead', description: 'Switched to protect the lead — defensive, slow, low aggression.' })
    return
  }

  if (decision.type === 'chase-game') {
    const gameplan = isHome ? ctx.resolvedHomeGameplan : ctx.resolvedAwayGameplan
    const updated: ClubGameplan = { ...gameplan, offensiveStyle: 'attacking', tempo: 'fast', aggression: 'high' }
    if (isHome) ctx.resolvedHomeGameplan = updated
    else ctx.resolvedAwayGameplan = updated
    rerunModifierChain(ctx, isHome)
    ctx.effectiveAggressionQuarters.push('high')
    ctx.midMatchAdjustments.push({ quarter, decisionType: 'chase-game', description: 'Chasing the game — attacking, fast, high aggression.' })
    return
  }

  if (decision.type === 'activate-sub') {
    const sub = isHome ? ctx.homeSubstitute : ctx.awaySubstitute
    if (sub && !ctx.userSubActivated) {
      const activePlayers = isHome ? ctx.homeActivePlayers : ctx.awayActivePlayers
      activePlayers.push(sub)
      ctx.userSubActivated = true

      // Mark substitute as participated in stats
      const stats = isHome ? ctx.homeStats : ctx.awayStats
      const subStats = stats.find((s) => s.playerId === sub.id)
      if (subStats) {
        subStats.participated = true
        subStats.minutesPlayed = 30 // approximate remaining time
      }

      ctx.midMatchAdjustments.push({ quarter, decisionType: 'activate-sub', description: `Activated substitute ${sub.firstName} ${sub.lastName}.` })
      ctx.keyEvents.push({
        quarter: quarter + 1,
        minute: 0,
        type: 'tactical-change',
        description: `${sub.firstName} ${sub.lastName} enters the game as substitute`,
        playerId: sub.id,
        clubId: userClubId,
      })
    }
    return
  }

  if (decision.type === 'tag-switch' && decision.params?.tagTargetPlayerId) {
    const targetId = decision.params.tagTargetPlayerId
    // Rebuild tactical runtime with a simple hard tag on the target
    const ownPlayers = isHome ? ctx.homeActivePlayers : ctx.awayActivePlayers
    const oppPlayers = isHome ? ctx.awayActivePlayers : ctx.homeActivePlayers
    // Find best tagger (highest tackling)
    const tagger = [...ownPlayers].sort((a, b) =>
      (b.attributes.tackling + b.attributes.pressure) - (a.attributes.tackling + a.attributes.pressure),
    )[0]
    if (tagger) {
      const customTactics = {
        hardTags: [{ id: `tag-${tagger.id}-${targetId}`, taggerPlayerId: tagger.id, targetPlayerId: targetId, intensity: 'standard' as const }],
        physicalAttention: [],
        roleAssignments: [],
      }
      const newRuntime = buildTacticalRuntime(customTactics, ownPlayers, oppPlayers)
      if (isHome) ctx.homeTactical = newRuntime
      else ctx.awayTactical = newRuntime

      const targetPlayer = oppPlayers.find((p) => p.id === targetId)
      const targetName = targetPlayer ? `${targetPlayer.firstName} ${targetPlayer.lastName}` : 'opponent'
      ctx.midMatchAdjustments.push({ quarter, decisionType: 'tag-switch', description: `Tag switched to ${targetName}.` })
    }
    return
  }

  if ((decision.type === 'move-player-forward' || decision.type === 'move-player-back') && decision.params?.movePlayerId) {
    const direction = decision.params.moveDirection ?? (decision.type === 'move-player-forward' ? 'forward' : 'back')
    ctx.positionOverrides.set(decision.params.movePlayerId, direction)

    const userPlayers = isHome ? ctx.homeActivePlayers : ctx.awayActivePlayers
    const player = userPlayers.find((p) => p.id === decision.params!.movePlayerId)
    const playerName = player ? `${player.firstName} ${player.lastName}` : 'Player'
    ctx.midMatchAdjustments.push({
      quarter,
      decisionType: decision.type,
      description: `Moved ${playerName} ${direction}.`,
    })
    return
  }
}

// ---------------------------------------------------------------------------
// Coach suggestions
// ---------------------------------------------------------------------------

export function generateCoachSuggestions(
  ctx: MatchContext,
  userClubId: string,
): CoachSuggestion[] {
  const suggestions: CoachSuggestion[] = []
  const isHome = userClubId === ctx.input.homeClubId
  const userStats = isHome ? ctx.homeStats : ctx.awayStats
  const oppStats  = isHome ? ctx.awayStats  : ctx.homeStats
  const userScore = isHome ? ctx.currentHomeTotal : ctx.currentAwayTotal
  const oppScore  = isHome ? ctx.currentAwayTotal : ctx.currentHomeTotal
  const margin    = userScore - oppScore
  const quarter   = ctx.quartersCompleted

  const sum = (arr: typeof userStats, key: keyof typeof arr[0]): number =>
    arr.reduce((t, s) => t + (s[key] as number), 0)

  const userDisposals = sum(userStats, 'disposals')
  const oppDisposals  = sum(oppStats,  'disposals')
  const userI50       = sum(userStats, 'insideFifties')
  const oppI50        = sum(oppStats,  'insideFifties')
  const userClearances = sum(userStats, 'clearances')
  const oppClearances  = sum(oppStats,  'clearances')
  const userContested  = sum(userStats, 'contestedPossessions')
  const oppContested   = sum(oppStats,  'contestedPossessions')
  const userTackles    = sum(userStats, 'tackles')
  const oppTackles     = sum(oppStats,  'tackles')
  const userGoals      = sum(userStats, 'goals')
  const userI50Shots   = Math.max(1, userI50)

  // 1. Possession dominance
  if (oppDisposals > userDisposals * 1.2 && userDisposals > 0) {
    suggestions.push({
      id: 'possession-deficit',
      priority: 'major',
      title: 'Possession Imbalance',
      detail: `Opponent is winning the ball ${oppDisposals}–${userDisposals}. You need to win more of the ball at ground level.`,
      suggestedAction: 'Raise Tempo to force more contest opportunities',
    })
  }

  // 2. Clearance trouble
  if (oppClearances > userClearances * 1.35 && userClearances > 0) {
    suggestions.push({
      id: 'clearance-deficit',
      priority: 'critical',
      title: 'Losing the Stoppage Battle',
      detail: `Opponent winning clearances ${oppClearances}–${userClearances}. The ball is coming out the wrong way at stoppages.`,
      suggestedAction: 'Adjust Stoppage Setup to cluster more numbers around the ball',
    })
  }

  // 3. Inside 50 drought
  if (oppI50 > userI50 * 1.4 && oppI50 > 5) {
    suggestions.push({
      id: 'inside50-drought',
      priority: margin < 0 ? 'critical' : 'major',
      title: 'Not Getting the Ball Inside 50',
      detail: `Opponent has ${oppI50} inside-50 entries to your ${userI50}. The forward line is starved of supply.`,
      suggestedAction: 'Increase Corridor Use to drive the ball directly to your forwards',
    })
  }

  // 4. Accuracy problem — converting less than 50% from I50
  const conversionRate = userGoals / userI50Shots
  if (userI50 > 4 && conversionRate < 0.35) {
    suggestions.push({
      id: 'accuracy-issue',
      priority: 'major',
      title: 'Poor Goal Conversion',
      detail: `Only ${(conversionRate * 100).toFixed(0)}% conversion from inside-50. Reduce tempo to create better set-shot opportunities.`,
      suggestedAction: 'Lower Tempo — more time for quality shots at goal',
    })
  }

  // 5. Getting outworked physically
  if (oppContested > userContested * 1.3 && userContested > 0) {
    suggestions.push({
      id: 'contested-deficit',
      priority: 'major',
      title: 'Losing Contested Possessions',
      detail: `Opponent winning contested ball ${oppContested}–${userContested}. Consider pushing your hardest workers up to spread the load.`,
      suggestedAction: 'Raise Defensive Press to crowd contests',
    })
  }

  // 6. Opponents being physical — high tackle count
  if (oppTackles > userTackles * 1.4 && quarter >= 2) {
    suggestions.push({
      id: 'tackle-pressure',
      priority: 'minor',
      title: 'Under Heavy Tackle Pressure',
      detail: `Opponent has laid ${oppTackles} tackles to your ${userTackles}. Moving the ball quicker out of congestion could help.`,
      suggestedAction: 'Increase Tempo to reduce time holding the ball',
    })
  }

  // 7. Blowout situation
  if (margin <= -40 && quarter <= 3) {
    suggestions.push({
      id: 'blowout-response',
      priority: 'critical',
      title: 'Significant Deficit — Drastic Action Needed',
      detail: `Down by ${Math.abs(margin)} points. Standard adjustments won't be enough — need high-risk, high-reward changes now.`,
      suggestedAction: 'Chase the Game — attack fast, press hard, leave nothing behind',
    })
  }

  // 8. Protecting a lead in Q4
  if (margin >= 20 && quarter === 3) {
    suggestions.push({
      id: 'protect-lead-q4',
      priority: 'major',
      title: 'Protect the Lead Into Q4',
      detail: `Up by ${margin} points heading into the final quarter. Consider slowing the game down to reduce opponent opportunities.`,
      suggestedAction: 'Lower Tempo + Raise Defensive Press to suffocate their attack',
    })
  }

  // Cap at 4, prioritise by severity
  const order: Record<CoachSuggestion['priority'], number> = { critical: 0, major: 1, minor: 2 }
  return suggestions.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 4)
}

// ---------------------------------------------------------------------------
// Gameplan slider application
// ---------------------------------------------------------------------------

function sliderToTempo(v: number): 'slow' | 'medium' | 'fast' {
  return v <= 33 ? 'slow' : v <= 66 ? 'medium' : 'fast'
}
function sliderToCentreTactic(v: number): 'spread' | 'balanced' | 'cluster' {
  return v <= 33 ? 'spread' : v <= 66 ? 'balanced' : 'cluster'
}
function sliderToDefensiveLine(v: number): 'zone' | 'run' | 'hold' | 'press' {
  return v <= 25 ? 'zone' : v <= 50 ? 'run' : v <= 75 ? 'hold' : 'press'
}
function sliderToStoppageTactic(v: number): 'spread' | 'balanced' | 'cluster' {
  return v <= 33 ? 'spread' : v <= 66 ? 'balanced' : 'cluster'
}

export function gameplanToSliders(gameplan: import('@/types/club').ClubGameplan): GameplanSliders {
  const tempoMap: Record<string, number> = { slow: 15, medium: 50, fast: 85 }
  const tacticMap: Record<string, number> = { spread: 15, balanced: 50, cluster: 85 }
  const defMap: Record<string, number> = { zone: 10, run: 35, hold: 62, press: 85 }
  return {
    tempo: tempoMap[gameplan.tempo ?? 'medium'] ?? 50,
    corridorUse: tacticMap[gameplan.centreTactic ?? 'balanced'] ?? 50,
    defensivePress: defMap[gameplan.defensiveLine ?? 'hold'] ?? 62,
    stoppageSetup: tacticMap[gameplan.stoppageTactic ?? 'balanced'] ?? 50,
  }
}

export function applyGameplanSliders(
  ctx: MatchContext,
  sliders: GameplanSliders,
  userClubId: string,
): void {
  const isHome = userClubId === ctx.input.homeClubId
  const gameplan = isHome ? ctx.resolvedHomeGameplan : ctx.resolvedAwayGameplan
  const updated = {
    ...gameplan,
    tempo: sliderToTempo(sliders.tempo),
    centreTactic: sliderToCentreTactic(sliders.corridorUse),
    defensiveLine: sliderToDefensiveLine(sliders.defensivePress),
    stoppageTactic: sliderToStoppageTactic(sliders.stoppageSetup),
  }
  if (isHome) ctx.resolvedHomeGameplan = updated
  else ctx.resolvedAwayGameplan = updated
  rerunModifierChain(ctx, isHome)

  const quarter = ctx.quartersCompleted
  ctx.midMatchAdjustments.push({
    quarter,
    decisionType: 'apply-gameplan-sliders',
    description: `Gameplan updated — Tempo: ${updated.tempo}, Corridor: ${updated.centreTactic}, Press: ${updated.defensiveLine}, Stoppage: ${updated.stoppageTactic}.`,
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rerunModifierChain(ctx: MatchContext, isHome: boolean): void {
  const gameplan = isHome ? ctx.resolvedHomeGameplan : ctx.resolvedAwayGameplan
  const identity = isHome ? ctx.homeClubTacticalIdentity : ctx.awayClubTacticalIdentity

  const baseMods = applyTacticalIdentityModifiers(
    computeGameplanModifiers(gameplan),
    identity,
  )
  const finalMods: GameplanModifiers = applyConditionToGameplanModifiers(baseMods, gameplan, ctx.weather)

  if (isHome) ctx.homeMods = finalMods
  else ctx.awayMods = finalMods
}

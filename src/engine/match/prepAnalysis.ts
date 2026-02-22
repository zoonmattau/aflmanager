import type { Player } from '@/types/player'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrepFactor {
  label: string
  impact: 'positive' | 'neutral' | 'negative'
  detail: string
}

export interface PlayerPrepNote {
  playerId: string
  playerName: string
  note: string
  impact: 'positive' | 'negative'
}

export interface PrepAnalysis {
  overallReadiness: 'excellent' | 'good' | 'mixed' | 'poor'
  avgTeamFatigue: number    // pre-match snapshot
  avgTeamFitness: number
  factors: PrepFactor[]     // 2–4 items
  playerHighlights: PlayerPrepNote[]  // 1–3 items
  narrative: string         // 2–3 sentence summary
}

export interface PrepAnalysisInput {
  userClubId: string
  won: boolean
  margin: number
  avgPreMatchFatigue: number
  avgPreMatchFitness: number
  avgFatigueChange: number        // from lastTrainingReport this week
  hasHeavySession: boolean
  hasRecoverySession: boolean
  travelFatigueApplied: number
  venueName: string
  weatherCondition: string
  playerHighlightCandidates: Array<{
    player: Player
    preMatchFatigue: number
    matchRating: number
  }>
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generatePrepAnalysis(input: PrepAnalysisInput): PrepAnalysis {
  const {
    won, margin,
    avgPreMatchFatigue, avgPreMatchFitness,
    avgFatigueChange, hasHeavySession, hasRecoverySession,
    travelFatigueApplied, venueName,
    weatherCondition,
    playerHighlightCandidates,
  } = input

  const factors: PrepFactor[] = []

  // ── Training load factor ────────────────────────────────────────────────
  if (hasRecoverySession && avgFatigueChange <= 6) {
    factors.push({
      label: 'Recovery focus',
      impact: 'positive',
      detail: `Light sessions kept the squad fresh — avg fatigue change ${avgFatigueChange > 0 ? '+' : ''}${avgFatigueChange.toFixed(1)}.`,
    })
  } else if (avgFatigueChange > 12 || hasHeavySession) {
    factors.push({
      label: 'Heavy training load',
      impact: 'negative',
      detail: `Intense sessions this week drove up squad fatigue (avg change +${avgFatigueChange.toFixed(1)}).`,
    })
  } else {
    factors.push({
      label: 'Moderate training',
      impact: 'neutral',
      detail: `Balanced week — avg fatigue change +${avgFatigueChange.toFixed(1)}.`,
    })
  }

  // ── Travel factor ───────────────────────────────────────────────────────
  if (travelFatigueApplied > 6) {
    factors.push({
      label: 'Long travel',
      impact: 'negative',
      detail: `Trip to ${venueName} added ${Math.round(travelFatigueApplied)} points of travel fatigue to the group.`,
    })
  } else if (travelFatigueApplied > 0) {
    factors.push({
      label: 'Travel',
      impact: 'neutral',
      detail: `Short travel to ${venueName} had minimal impact.`,
    })
  }

  // ── Fitness factor ──────────────────────────────────────────────────────
  if (avgPreMatchFitness > 78) {
    factors.push({
      label: 'High squad fitness',
      impact: 'positive',
      detail: `Average pre-game fitness was ${avgPreMatchFitness.toFixed(0)} — squad arrived in peak physical shape.`,
    })
  } else if (avgPreMatchFitness < 58) {
    factors.push({
      label: 'Low squad fitness',
      impact: 'negative',
      detail: `Average pre-game fitness was only ${avgPreMatchFitness.toFixed(0)} — sustained workloads have taken a toll.`,
    })
  }

  // ── Weather factor ──────────────────────────────────────────────────────
  if ((weatherCondition === 'wet' || weatherCondition === 'windy') && !won) {
    factors.push({
      label: 'Adverse conditions',
      impact: 'neutral',
      detail: `${weatherCondition.charAt(0).toUpperCase() + weatherCondition.slice(1)} conditions disrupted game plans going in.`,
    })
  }

  // Clamp to 2–4 factors
  const trimmed = factors.slice(0, 4)
  if (trimmed.length < 2) {
    trimmed.push({
      label: 'Standard preparation',
      impact: 'neutral',
      detail: 'No major preparation issues or advantages this week.',
    })
  }

  // ── Player highlights ───────────────────────────────────────────────────
  const highlights: PlayerPrepNote[] = []

  if (playerHighlightCandidates.length > 0) {
    const sorted = [...playerHighlightCandidates].sort((a, b) => a.preMatchFatigue - b.preMatchFatigue)

    // Freshest + high rating → positive
    const freshStars = sorted.filter((c) => c.matchRating >= 7.5)
    if (freshStars.length > 0) {
      const c = freshStars[0]
      const name = `${c.player.firstName.charAt(0)}. ${c.player.lastName}`
      highlights.push({
        playerId: c.player.id,
        playerName: name,
        note: `Fresh legs (${c.preMatchFatigue} fat pre-game) — dominated with a ${c.matchRating.toFixed(1)} rating.`,
        impact: 'positive',
      })
    }

    // Most fatigued + low rating → negative
    const tired = [...playerHighlightCandidates]
      .sort((a, b) => b.preMatchFatigue - a.preMatchFatigue)
      .filter((c) => c.matchRating <= 6.5)
    if (tired.length > 0) {
      const c = tired[0]
      const name = `${c.player.firstName.charAt(0)}. ${c.player.lastName}`
      highlights.push({
        playerId: c.player.id,
        playerName: name,
        note: `Heavy legs (${c.preMatchFatigue} fat pre-game) — struggled, rating ${c.matchRating.toFixed(1)}.`,
        impact: 'negative',
      })
    }
  }

  // ── Overall readiness ───────────────────────────────────────────────────
  const positiveCount = trimmed.filter((f) => f.impact === 'positive').length
  const negativeCount = trimmed.filter((f) => f.impact === 'negative').length

  let overallReadiness: PrepAnalysis['overallReadiness']
  if (positiveCount >= 2 && negativeCount === 0) overallReadiness = 'excellent'
  else if (positiveCount > negativeCount)         overallReadiness = 'good'
  else if (negativeCount > positiveCount)         overallReadiness = 'poor'
  else                                            overallReadiness = 'mixed'

  // ── Narrative ───────────────────────────────────────────────────────────
  const narrative = buildNarrative({
    overallReadiness, won, margin,
    avgPreMatchFatigue, avgPreMatchFitness,
    hasRecoverySession, hasHeavySession,
    travelFatigueApplied, venueName,
    weatherCondition,
  })

  return {
    overallReadiness,
    avgTeamFatigue: Math.round(avgPreMatchFatigue),
    avgTeamFitness: Math.round(avgPreMatchFitness),
    factors: trimmed,
    playerHighlights: highlights.slice(0, 3),
    narrative,
  }
}

// ---------------------------------------------------------------------------
// Narrative builder
// ---------------------------------------------------------------------------

interface NarrativeInput {
  overallReadiness: PrepAnalysis['overallReadiness']
  won: boolean
  margin: number
  avgPreMatchFatigue: number
  avgPreMatchFitness: number
  hasRecoverySession: boolean
  hasHeavySession: boolean
  travelFatigueApplied: number
  venueName: string
  weatherCondition: string
}

function buildNarrative(n: NarrativeInput): string {
  const parts: string[] = []

  // Opening sentence — prep quality + match outcome
  if (n.overallReadiness === 'excellent') {
    parts.push(
      n.won
        ? `A well-rested and physically primed squad capitalised on their preparation advantage${n.margin >= 30 ? ', running away with a convincing win' : ''}.`
        : `Despite excellent preparation with avg fatigue at ${Math.round(n.avgPreMatchFatigue)}, the result didn't fall our way.`,
    )
  } else if (n.overallReadiness === 'good') {
    parts.push(
      n.won
        ? `The squad went in reasonably fresh (avg fatigue ${Math.round(n.avgPreMatchFatigue)}) and converted it into a ${n.margin >= 24 ? 'commanding' : 'solid'} win.`
        : `A reasonable preparation didn't translate on the day — the margin of ${n.margin} tells its own story.`,
    )
  } else if (n.overallReadiness === 'mixed') {
    parts.push(
      `A mixed preparation week left some players fresher than others, and it showed in the intensity levels across four quarters.`,
    )
  } else {
    parts.push(
      n.won
        ? `Despite a heavy-legged group arriving at ${n.venueName}, the squad dug deep to grind out the win.`
        : `A fatigued squad (avg fatigue ${Math.round(n.avgPreMatchFatigue)}) paid the price — managing energy was a challenge all day.`,
    )
  }

  // Middle sentence — key cause
  if (n.hasRecoverySession && n.avgPreMatchFatigue <= 45) {
    parts.push(`The recovery-focused week made a real difference, with the squad arriving with ample energy in the tank.`)
  } else if (n.hasHeavySession) {
    parts.push(`Heavy training earlier in the week left its mark, with fatigue a visible factor in the back half.`)
  } else if (n.travelFatigueApplied > 6) {
    parts.push(`The long haul to ${n.venueName} was an additional drain the squad had to manage from the opening bounce.`)
  } else if (n.avgPreMatchFitness > 78) {
    parts.push(`High squad fitness levels across the board meant the group could sustain their intensity across all four quarters.`)
  }

  // Closing sentence — weather if relevant
  if ((n.weatherCondition === 'wet' || n.weatherCondition === 'windy') && !n.won) {
    parts.push(`${n.weatherCondition === 'wet' ? 'Wet' : 'Windy'} conditions added another layer of difficulty to an already challenging afternoon.`)
  }

  // Return at most 3 sentences
  return parts.slice(0, 3).join(' ')
}

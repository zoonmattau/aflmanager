import type { Player, PlayerAttributes } from '@/types/player'

export type TrendDirection = 'rising' | 'falling' | 'flat'

export interface HistoricalTrend {
  /** Signed delta vs the snapshot. e.g. +3, -2, 0 */
  delta: number
  direction: TrendDirection
  /** How many seasons back the compared snapshot is */
  windowSeasons: number
}

export interface ProjectedTrend {
  direction: TrendDirection
  confidence: 'high' | 'medium' | 'low'
  /** Human-readable explanation of each contributing factor */
  drivers: string[]
}

export interface AttributeTrendData {
  /** Null when no historical snapshot is available yet */
  historical: HistoricalTrend | null
  projected: ProjectedTrend
}

// ---------------------------------------------------------------------------
// Internal attribute sets (mirrors development.ts groupings)
// ---------------------------------------------------------------------------

const PHYSICAL_ATTRS = new Set<keyof PlayerAttributes>([
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
])

const MENTAL_ATTRS = new Set<keyof PlayerAttributes>([
  'pressure', 'leadership', 'workRate', 'consistency', 'determination',
  'teamPlayer', 'clutch', 'disposalDecision', 'positioning', 'creativity',
  'anticipation', 'composure', 'zonalAwareness',
])

// Maps PlayerTrainingFocus → attribute keys it primarily boosts (mirrors trainingEngine)
const FOCUS_ATTR_MAP: Partial<Record<string, ReadonlyArray<keyof PlayerAttributes>>> = {
  kicking:      ['kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap'],
  handball:     ['handballEfficiency', 'handballDistance', 'handballReceive'],
  marking:      ['markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested'],
  physical:     ['speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery'],
  contested:    ['tackling', 'contested', 'clearance', 'hardness'],
  'game-sense': ['disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure'],
  offensive:    ['goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct'],
  defensive:    ['intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding'],
  ruck:         ['hitouts', 'ruckCreative', 'followUp'],
  mental:       ['pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch'],
  'set-pieces': ['centreBounce', 'boundaryThrowIn', 'stoppage'],
}

function isAttrInFocus(attrKey: keyof PlayerAttributes, focus: string | null | undefined): boolean {
  if (!focus) return false
  const attrs = FOCUS_ATTR_MAP[focus]
  return !!attrs && (attrs as ReadonlyArray<keyof PlayerAttributes>).includes(attrKey)
}

// ---------------------------------------------------------------------------
// Historical trend
// ---------------------------------------------------------------------------

/**
 * Compares the player's current attribute value to the oldest available
 * snapshot within `windowSeasons` seasons back.
 */
export function computeHistoricalTrend(
  player: Player,
  attrKey: keyof PlayerAttributes,
  windowSeasons: number,
  currentYear: number,
): HistoricalTrend | null {
  if (!player.attributeSnapshots) return null

  // Walk back from (currentYear - 1) to find the oldest available snapshot in window
  let snapshotYear: number | null = null
  for (let y = currentYear - 1; y >= currentYear - windowSeasons; y--) {
    if (player.attributeSnapshots[y] !== undefined) {
      snapshotYear = y
      // Keep going to find the oldest within the window
    }
  }
  if (snapshotYear === null) return null

  const snapshotVal = player.attributeSnapshots[snapshotYear][attrKey]
  if (snapshotVal === undefined) return null

  const current = player.attributes[attrKey] ?? 0
  const delta = Math.round(current - snapshotVal)
  const direction: TrendDirection = delta >= 2 ? 'rising' : delta <= -2 ? 'falling' : 'flat'

  return { delta, direction, windowSeasons: currentYear - snapshotYear }
}

// ---------------------------------------------------------------------------
// Projected trend
// ---------------------------------------------------------------------------

/**
 * Estimates the direction an attribute is likely to move over the next
 * offseason, based on the player's age phase, training focus, fatigue,
 * injury status, and proximity to their potential ceiling.
 */
export function computeProjectedTrend(
  player: Player,
  attrKey: keyof PlayerAttributes,
): ProjectedTrend {
  const { age, hiddenAttributes, fatigue, injury, trainingFocus } = player
  const { peakAgeStart, peakAgeEnd, potentialCeiling, declineRate, developmentRate } = hiddenAttributes

  const drivers: string[] = []
  const currentVal = player.attributes[attrKey] ?? 0
  const isPhysical = PHYSICAL_ATTRS.has(attrKey)
  const isMental = MENTAL_ATTRS.has(attrKey)
  const playerFocused = isAttrInFocus(attrKey, trainingFocus ?? null)

  // 1. Development phase ---------------------------------------------------
  let phase: 'growth' | 'peak' | 'decline'
  if (age < peakAgeStart) phase = 'growth'
  else if (age <= peakAgeEnd) phase = 'peak'
  else phase = 'decline'

  let baseDir: TrendDirection
  let confidence: 'high' | 'medium' | 'low'

  if (phase === 'growth') {
    baseDir = 'rising'
    const yearsToGo = peakAgeStart - age
    confidence = yearsToGo >= 3 ? 'high' : 'medium'
    if (age <= 21 && isPhysical) {
      drivers.push('Growth phase — physical attributes developing rapidly')
    } else if (developmentRate >= 1.5) {
      drivers.push(`Growth phase — fast developer (${yearsToGo} season${yearsToGo !== 1 ? 's' : ''} to peak)`)
    } else {
      drivers.push(`Growth phase — ${yearsToGo} season${yearsToGo !== 1 ? 's' : ''} to peak`)
    }
  } else if (phase === 'peak') {
    baseDir = 'flat'
    confidence = 'medium'
    const yr = age - peakAgeStart + 1
    const total = Math.max(1, peakAgeEnd - peakAgeStart + 1)
    drivers.push(`Peak stability — year ${yr} of ${total}`)
  } else {
    const yearsPostPeak = age - peakAgeEnd
    confidence = yearsPostPeak >= 3 ? 'high' : 'medium'
    if (isMental && yearsPostPeak <= 3) {
      // Mental attributes resist early decline
      baseDir = 'flat'
      drivers.push(`Decline phase — mental attribute (protected early post-peak)`)
    } else if (isPhysical) {
      baseDir = 'falling'
      drivers.push(`Decline phase — physical attrition (${yearsPostPeak}yr post-peak)`)
      if (declineRate >= 1.4) drivers.push('Fast-decliner profile')
    } else {
      baseDir = 'falling'
      drivers.push(`Decline phase — ${yearsPostPeak} season${yearsPostPeak !== 1 ? 's' : ''} post-peak`)
    }
  }

  // 2. Training focus modifier ---------------------------------------------
  if (playerFocused) {
    if (phase === 'decline' && baseDir === 'falling') {
      baseDir = 'flat'
      drivers.push(`Training: ${trainingFocus} (protecting from decline)`)
    } else if (phase !== 'decline') {
      baseDir = 'rising'
      drivers.push(`Training focus: ${trainingFocus} (+14% to this category)`)
    } else {
      drivers.push(`Training focus: ${trainingFocus}`)
    }
    confidence = 'high'
  }

  // 3. Near potential ceiling (growth phase only) --------------------------
  if (phase === 'growth' && currentVal >= potentialCeiling - 4) {
    baseDir = 'flat'
    confidence = 'high'
    drivers.push(`Near potential ceiling (${potentialCeiling}) — growth will stall here`)
  }

  // 4. Overtraining / high fatigue ----------------------------------------
  if (fatigue >= 80) {
    if (baseDir === 'rising') baseDir = 'flat'
    drivers.push('Overtraining risk — development may stall this cycle')
    confidence = 'low'
  } else if (fatigue >= 70) {
    drivers.push('High fatigue load — consider recovery week')
  }

  // 5. Injury recovery -----------------------------------------------------
  const weeksOut = (injury as { weeksRemaining?: number } | null)?.weeksRemaining ?? 0
  if (weeksOut > 0) {
    if (isPhysical && baseDir === 'rising') baseDir = 'flat'
    drivers.push(`Recovering from injury (${weeksOut}wk remaining) — development paused`)
    if (confidence === 'high') confidence = 'medium'
  }

  if (drivers.length === 0) drivers.push('No strong signals this season')

  return { direction: baseDir, confidence, drivers }
}

// ---------------------------------------------------------------------------
// Batch helper
// ---------------------------------------------------------------------------

/** Compute trends for all attributes at once. */
export function computeAllTrends(
  player: Player,
  currentYear: number,
  windowSeasons: number,
): Record<keyof PlayerAttributes, AttributeTrendData> {
  const result = {} as Record<keyof PlayerAttributes, AttributeTrendData>
  for (const key of Object.keys(player.attributes) as Array<keyof PlayerAttributes>) {
    result[key] = {
      historical: computeHistoricalTrend(player, key, windowSeasons, currentYear),
      projected: computeProjectedTrend(player, key),
    }
  }
  return result
}

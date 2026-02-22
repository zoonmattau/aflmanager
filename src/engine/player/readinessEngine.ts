import type { Player } from '@/types/player'

export type ReadinessStatus = 'peaking' | 'ready' | 'managed' | 'fatigued' | 'overdone'

// ── Overtraining Detection ────────────────────────────────────────────────────

/** Fatigue threshold above which a player is considered overtrained. */
export const OVERTRAINING_FATIGUE_THRESHOLD = 72

export type OvertrainingSeverity = 'none' | 'mild' | 'heavy'

/**
 * How severely a player is overloaded by accumulated training and match load.
 *   mild  = fatigue 72–81 — running on empty, noticeably flat
 *   heavy = fatigue 82+  — dangerously overdone, significant performance/injury risk
 */
export function getOvertrainingSeverity(player: Player): OvertrainingSeverity {
  if (player.fatigue >= 82) return 'heavy'
  if (player.fatigue >= OVERTRAINING_FATIGUE_THRESHOLD) return 'mild'
  return 'none'
}

/**
 * Returns a human-readable description of the overtraining state for
 * display in warnings and post-match explanations.
 */
export function getOvertrainingLabel(severity: OvertrainingSeverity): string {
  if (severity === 'heavy') return 'Dangerously overdone'
  if (severity === 'mild') return 'Running on empty'
  return ''
}

export interface PlayerReadiness {
  score: number           // 0–100 composite
  status: ReadinessStatus
  flags: string[]         // e.g. ["High fatigue", "Strong form"]
}

/**
 * Composite readiness score:
 *   score = (fitness × 0.40) + ((100 − fatigue) × 0.40) + (form × 0.20)
 *   morale ≥ 80 → +4; morale < 45 → −4
 *
 * Thresholds: peaking ≥ 80 | ready 60–79 | managed 45–59 | fatigued 30–44 | overdone < 30
 */
export function computePlayerReadiness(player: Player): PlayerReadiness {
  let raw = player.fitness * 0.40 + (100 - player.fatigue) * 0.40 + player.form * 0.20

  if (player.morale >= 80) raw += 4
  else if (player.morale < 45) raw -= 4

  const score = Math.max(0, Math.min(100, Math.round(raw)))

  let status: ReadinessStatus
  if (score >= 80)      status = 'peaking'
  else if (score >= 60) status = 'ready'
  else if (score >= 45) status = 'managed'
  else if (score >= 30) status = 'fatigued'
  else                  status = 'overdone'

  const flags: string[] = []
  if (player.fatigue >= 70)      flags.push('High fatigue')
  else if (player.fatigue <= 30) flags.push('Fresh legs')
  if (player.form >= 75)         flags.push('Strong form')
  else if (player.form <= 35)    flags.push('Poor form')
  if (player.fitness >= 80)      flags.push('High fitness')
  else if (player.fitness <= 50) flags.push('Low fitness')
  if (player.morale >= 80)       flags.push('High morale')
  else if (player.morale < 45)   flags.push('Low morale')

  return { score, status, flags }
}

/**
 * Performance multiplier used inside simulateMatch:
 *   peaking=1.05 / ready=1.00 / managed=0.97 / fatigued=0.94 / overdone=0.90
 */
export function getReadinessMod(player: Player): number {
  const { status } = computePlayerReadiness(player)
  switch (status) {
    case 'peaking':  return 1.05
    case 'ready':    return 1.00
    case 'managed':  return 0.97
    case 'fatigued': return 0.94
    case 'overdone': return 0.90
  }
}

import type { Club, ClubGameplan } from '@/types/club'
import { SeededRNG } from '@/engine/core/rng'
import { getClubIdentity } from '@/engine/clubs/identity'

export function applyGameplanAdjustment(
  base: ClubGameplan,
  override: Partial<ClubGameplan> | null | undefined,
): ClubGameplan {
  if (!override) return { ...base, ruckNomination: { ...base.ruckNomination } }
  return {
    ...base,
    ...override,
    ruckNomination: {
      ...base.ruckNomination,
      ...(override.ruckNomination ?? {}),
    },
  }
}

function maybe<T>(rng: SeededRNG, chance: number, value: T): T | undefined {
  return rng.chance(chance) ? value : undefined
}

export function buildCounterAdjustment(
  club: Club,
  opponentPlan: ClubGameplan,
  rng: SeededRNG,
  options?: {
    tacticalAdjustment?: number
    discipline?: number
  },
): Partial<ClubGameplan> {
  const aggressive = club.aiPersonality.riskTolerance === 'aggressive'
  const conservative = club.aiPersonality.riskTolerance === 'conservative'
  const baseTweakChance = aggressive ? 0.82 : conservative ? 0.52 : 0.68
  const tacticalAdjustment = options?.tacticalAdjustment ?? 0.7
  const discipline = options?.discipline ?? 60
  const tacticalMultiplier = Math.max(0.7, Math.min(1.28, 0.72 + tacticalAdjustment * 0.48))
  const disciplineModifier = Math.max(0.92, Math.min(1.08, 0.95 + (discipline - 50) / 400))
  const tweakChance = Math.max(0.4, Math.min(0.95, baseTweakChance * tacticalMultiplier * disciplineModifier))

  const update: Partial<ClubGameplan> = {}
  const clubIdentity = getClubIdentity(club).current

  if (opponentPlan.offensiveStyle === 'attacking') {
    update.offensiveStyle = maybe(rng, tweakChance, 'defensive')
    update.defensiveLine = maybe(rng, tweakChance, 'press')
  } else if (opponentPlan.offensiveStyle === 'defensive') {
    update.offensiveStyle = maybe(rng, tweakChance, 'attacking')
    update.forwardLine = maybe(rng, tweakChance, 'run')
  }

  if (opponentPlan.tempo === 'fast') {
    update.tempo = maybe(rng, tweakChance, 'slow')
    update.midfieldLine = maybe(rng, tweakChance, 'hold')
  } else if (opponentPlan.tempo === 'slow') {
    update.tempo = maybe(rng, tweakChance, 'fast')
    update.midfieldLine = maybe(rng, tweakChance, 'press')
  }

  if (opponentPlan.centreTactic === 'cluster') {
    update.centreTactic = maybe(rng, tweakChance, 'spread')
  } else if (opponentPlan.centreTactic === 'spread') {
    update.centreTactic = maybe(rng, tweakChance, 'cluster')
  }

  if (opponentPlan.stoppageTactic === 'cluster') {
    update.stoppageTactic = maybe(rng, tweakChance, 'spread')
  } else if (opponentPlan.stoppageTactic === 'spread') {
    update.stoppageTactic = maybe(rng, tweakChance, 'cluster')
  }

  if (opponentPlan.kickInTactic === 'play-on-short') {
    update.defensiveLine = maybe(rng, tweakChance, 'press')
  } else if (opponentPlan.kickInTactic === 'play-on-long') {
    update.defensiveLine = maybe(rng, tweakChance, 'hold')
  }

  if (opponentPlan.forwardLine === 'press') {
    update.defensiveLine = maybe(rng, tweakChance, 'hold')
  } else if (opponentPlan.forwardLine === 'run') {
    update.defensiveLine = maybe(rng, tweakChance, 'zone')
  }

  if (!update.aggression) {
    if (aggressive) update.aggression = maybe(rng, 0.74, 'high')
    else if (conservative) update.aggression = maybe(rng, 0.62, 'low')
    else update.aggression = maybe(rng, 0.58, 'medium')
  }

  if (clubIdentity === 'defensive-powerhouse') {
    update.offensiveStyle = update.offensiveStyle ?? maybe(rng, 0.66, 'defensive')
    update.defensiveLine = update.defensiveLine ?? maybe(rng, 0.72, 'press')
    update.aggression = update.aggression ?? maybe(rng, 0.62, 'low')
  } else if (clubIdentity === 'star-chasing') {
    update.offensiveStyle = update.offensiveStyle ?? maybe(rng, 0.62, 'attacking')
    update.tempo = update.tempo ?? maybe(rng, 0.56, 'fast')
    update.aggression = update.aggression ?? maybe(rng, 0.64, 'high')
  } else {
    update.tempo = update.tempo ?? maybe(rng, 0.5, 'medium')
    update.aggression = update.aggression ?? maybe(rng, 0.55, 'medium')
  }

  return update
}

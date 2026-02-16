import type { ClubGameplan, TacticalIdentity } from '@/types/club'
import { getAlignedGameplan } from '@/engine/core/tacticalIdentity'

/**
 * Returns a ClubGameplan with sensible default values.
 * Used when initializing new clubs or resetting a gameplan.
 */
export function createDefaultGameplan(): ClubGameplan {
  return {
    offensiveStyle: 'balanced',
    tempo: 'medium',
    aggression: 'medium',
    kickInTactic: 'set-up-short',
    centreTactic: 'balanced',
    stoppageTactic: 'balanced',
    defensiveLine: 'zone',
    midfieldLine: 'run',
    forwardLine: 'press',
    ruckNomination: {
      primaryRuckId: null,
      backupRuckId: null,
      aroundTheGround: false,
    },
    rotations: 'medium',
  }
}

export function createIdentityAlignedGameplan(identity: TacticalIdentity): ClubGameplan {
  const base = createDefaultGameplan()
  const overrides = getAlignedGameplan(identity)
  return { ...base, ...overrides }
}

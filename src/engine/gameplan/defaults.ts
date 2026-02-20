import type { ClubGameplan, PlayStyleRules, TacticalIdentity } from '@/types/club'
import { getAlignedGameplan } from '@/engine/core/tacticalIdentity'

export const DEFAULT_PLAY_STYLE: PlayStyleRules = {
  forwardLeading: 'diagonal',
  tapDirection: 'read-and-react',
  stoppageMovement: 'balanced',
  switchFrequency: 'normal',
  noUTurns: false,
  handbballToRunner: false,
  noKickBackAcrossGoal: false,
}

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
    playStyle: { ...DEFAULT_PLAY_STYLE },
  }
}

export function createIdentityAlignedGameplan(identity: TacticalIdentity): ClubGameplan {
  const base = createDefaultGameplan()
  const overrides = getAlignedGameplan(identity)
  return { ...base, ...overrides }
}

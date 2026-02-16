import type { TacticalIdentity, ClubGameplan } from '@/types/club'
import type { DraftRole, DraftArchetype } from '@/types/draft'
import type { PlayerPreferredRole, PlayerAttributes } from '@/types/player'

// ---------------------------------------------------------------------------
// Match Simulation Modifiers
// ---------------------------------------------------------------------------

interface TacticalModifiers {
  possessionBonus: number
  inside50Mult: number
  accuracyMult: number
  contestedMult: number
  uncontestedMult: number
  tackleMult: number
  markMult: number
  opponentReboundMult: number
  hitoutMult: number
}

const TACTICAL_MODIFIERS: Record<TacticalIdentity, TacticalModifiers> = {
  'fast-movement': {
    possessionBonus: 10, inside50Mult: 1.04, accuracyMult: 0.98,
    contestedMult: 0.96, uncontestedMult: 1.06, tackleMult: 0.97,
    markMult: 1.00, opponentReboundMult: 1.03, hitoutMult: 0.98,
  },
  'contested': {
    possessionBonus: 0, inside50Mult: 1.00, accuracyMult: 0.99,
    contestedMult: 1.08, uncontestedMult: 0.94, tackleMult: 1.05,
    markMult: 0.98, opponentReboundMult: 0.98, hitoutMult: 1.04,
  },
  'defensive': {
    possessionBonus: -5, inside50Mult: 0.94, accuracyMult: 1.03,
    contestedMult: 1.02, uncontestedMult: 1.00, tackleMult: 1.06,
    markMult: 1.03, opponentReboundMult: 0.90, hitoutMult: 1.00,
  },
  'stoppage-focused': {
    possessionBonus: 0, inside50Mult: 0.98, accuracyMult: 1.00,
    contestedMult: 1.06, uncontestedMult: 0.97, tackleMult: 1.02,
    markMult: 0.99, opponentReboundMult: 0.97, hitoutMult: 1.10,
  },
  'corridor-heavy': {
    possessionBonus: 5, inside50Mult: 1.06, accuracyMult: 1.02,
    contestedMult: 0.97, uncontestedMult: 1.00, tackleMult: 0.98,
    markMult: 1.05, opponentReboundMult: 1.04, hitoutMult: 0.98,
  },
}

export function getTacticalModifiers(identity: TacticalIdentity): TacticalModifiers {
  return TACTICAL_MODIFIERS[identity]
}

// ---------------------------------------------------------------------------
// Draft Preferences
// ---------------------------------------------------------------------------

interface TacticalDraftPreferences {
  preferredRoles: DraftRole[]
  preferredArchetypes: DraftArchetype[]
  preferredPlayerRoles: PlayerPreferredRole[]
}

const DRAFT_PREFERENCES: Record<TacticalIdentity, TacticalDraftPreferences> = {
  'fast-movement': {
    preferredRoles: ['line-breaker', 'ball-winner'],
    preferredArchetypes: ['outside-runner', 'two-way-wing', 'rebound-defender'],
    preferredPlayerRoles: ['outside-mid', 'wing-runner', 'rebound-defender'],
  },
  'contested': {
    preferredRoles: ['ball-winner', 'ground-pressure', 'contested-mark'],
    preferredArchetypes: ['inside-bull', 'power-forward', 'lockdown-defender'],
    preferredPlayerRoles: ['inside-mid', 'pressure-forward', 'lockdown-defender'],
  },
  'defensive': {
    preferredRoles: ['shutdown', 'ground-pressure', 'ball-winner'],
    preferredArchetypes: ['intercept-defender', 'lockdown-defender', 'small-pressure-forward'],
    preferredPlayerRoles: ['intercept-defender', 'lockdown-defender', 'pressure-forward'],
  },
  'stoppage-focused': {
    preferredRoles: ['ruck-craft', 'ball-winner', 'contested-mark'],
    preferredArchetypes: ['tap-ruck', 'mobile-ruck', 'inside-bull'],
    preferredPlayerRoles: ['ruck', 'inside-mid', 'key-forward'],
  },
  'corridor-heavy': {
    preferredRoles: ['aerial-threat', 'line-breaker', 'contested-mark'],
    preferredArchetypes: ['lead-up-forward', 'power-forward', 'rebound-defender'],
    preferredPlayerRoles: ['key-forward', 'intercept-defender', 'outside-mid'],
  },
}

export function getTacticalDraftPreferences(identity: TacticalIdentity): TacticalDraftPreferences {
  return DRAFT_PREFERENCES[identity]
}

// ---------------------------------------------------------------------------
// Trade Preferences
// ---------------------------------------------------------------------------

interface TacticalTradePreferences {
  preferredPlayerRoles: PlayerPreferredRole[]
  preferredAttributeKeys: (keyof PlayerAttributes)[]
}

const TRADE_PREFERENCES: Record<TacticalIdentity, TacticalTradePreferences> = {
  'fast-movement': {
    preferredPlayerRoles: ['outside-mid', 'wing-runner', 'rebound-defender'],
    preferredAttributeKeys: ['speed', 'handballEfficiency', 'fieldKicking', 'endurance', 'workRate'],
  },
  'contested': {
    preferredPlayerRoles: ['inside-mid', 'pressure-forward', 'lockdown-defender'],
    preferredAttributeKeys: ['contested', 'clearance', 'tackling', 'hardness', 'strength'],
  },
  'defensive': {
    preferredPlayerRoles: ['intercept-defender', 'lockdown-defender', 'pressure-forward'],
    preferredAttributeKeys: ['intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'tackling'],
  },
  'stoppage-focused': {
    preferredPlayerRoles: ['ruck', 'inside-mid', 'key-forward'],
    preferredAttributeKeys: ['hitouts', 'clearance', 'contested', 'centreBounce', 'stoppage'],
  },
  'corridor-heavy': {
    preferredPlayerRoles: ['key-forward', 'intercept-defender', 'outside-mid'],
    preferredAttributeKeys: ['kickingDistance', 'markingOverhead', 'markingLeading', 'fieldKicking', 'leadingPatterns'],
  },
}

export function getTacticalTradePreferences(identity: TacticalIdentity): TacticalTradePreferences {
  return TRADE_PREFERENCES[identity]
}

// ---------------------------------------------------------------------------
// Aligned Gameplan Overrides
// ---------------------------------------------------------------------------

const ALIGNED_GAMEPLANS: Record<TacticalIdentity, Partial<ClubGameplan>> = {
  'fast-movement': {
    offensiveStyle: 'attacking', tempo: 'fast', kickInTactic: 'play-on-short',
    centreTactic: 'spread', rotations: 'high',
  },
  'contested': {
    aggression: 'high', centreTactic: 'cluster', stoppageTactic: 'cluster',
    midfieldLine: 'press', rotations: 'low',
  },
  'defensive': {
    offensiveStyle: 'defensive', tempo: 'slow', defensiveLine: 'press',
    midfieldLine: 'press', kickInTactic: 'set-up-short',
  },
  'stoppage-focused': {
    stoppageTactic: 'cluster', centreTactic: 'cluster', forwardLine: 'hold',
  },
  'corridor-heavy': {
    offensiveStyle: 'attacking', kickInTactic: 'set-up-long',
    forwardLine: 'press', defensiveLine: 'hold',
  },
}

export function getAlignedGameplan(identity: TacticalIdentity): Partial<ClubGameplan> {
  return ALIGNED_GAMEPLANS[identity]
}

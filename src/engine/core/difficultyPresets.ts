import type { GameSettings, RealismSettings } from '@/types/game'

export interface DifficultyPreset {
  id: GameSettings['difficulty']
  label: string
  description: string
  /** Flat overrides applied on top of current settings */
  overrides: {
    difficulty: GameSettings['difficulty']
    salaryCapAmount: number
    realism: Partial<RealismSettings>
    injuryFrequency: GameSettings['injuryFrequency']
    developmentSpeed: GameSettings['developmentSpeed']
  }
}

export const DIFFICULTY_PRESETS: DifficultyPreset[] = [
  {
    id: 'easy',
    label: 'Easy',
    description: 'Higher salary cap, fewer injuries, faster player development. Great for learning the game.',
    overrides: {
      difficulty: 'easy',
      salaryCapAmount: 21_000_000,
      realism: {
        playerLoyalty: false,
        tradeRequests: false,
        playerRoleDisputes: false,
        salaryDumpTrades: false,
        softCapSpending: false,
        draftVariance: false,
        ngaAcademy: false,
        fixtureBlockbusterBias: true,
        coachingCarousel: false,
        boardPressure: false,
        aflHouseInterference: false,
      },
      injuryFrequency: 'low',
      developmentSpeed: 'fast',
    },
  },
  {
    id: 'medium',
    label: 'Medium',
    description: 'Standard AFL rules with balanced settings. The authentic experience.',
    overrides: {
      difficulty: 'medium',
      salaryCapAmount: 18_300_000,
      realism: {
        playerLoyalty: true,
        tradeRequests: true,
        playerRoleDisputes: true,
        salaryDumpTrades: true,
        softCapSpending: false,
        draftVariance: true,
        ngaAcademy: true,
        fixtureBlockbusterBias: true,
        coachingCarousel: true,
        boardPressure: true,
        aflHouseInterference: false,
      },
      injuryFrequency: 'medium',
      developmentSpeed: 'normal',
    },
  },
  {
    id: 'hard',
    label: 'Hard',
    description: 'Tight salary cap, frequent injuries, slow development. A real challenge.',
    overrides: {
      difficulty: 'hard',
      salaryCapAmount: 15_000_000,
      realism: {
        playerLoyalty: true,
        tradeRequests: true,
        playerRoleDisputes: true,
        salaryDumpTrades: true,
        softCapSpending: true,
        draftVariance: true,
        ngaAcademy: true,
        fixtureBlockbusterBias: true,
        coachingCarousel: true,
        boardPressure: true,
        aflHouseInterference: true,
      },
      injuryFrequency: 'high',
      developmentSpeed: 'slow',
    },
  },
]

/** Map development speed setting to a numeric multiplier for the growth formula. */
export function getDevelopmentSpeedMultiplier(speed: GameSettings['developmentSpeed']): number {
  switch (speed) {
    case 'slow': return 0.7
    case 'fast': return 1.4
    default: return 1.0
  }
}

/** Map injury frequency setting to a numeric multiplier for injury chance. */
export function getInjuryFrequencyMultiplier(freq: GameSettings['injuryFrequency']): number {
  switch (freq) {
    case 'low': return 0.5
    case 'high': return 1.5
    default: return 1.0
  }
}

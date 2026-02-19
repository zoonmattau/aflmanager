import type { GuernseyStyle } from './club'
import type {
  CustomCompetitionModel,
  CustomLadderRules,
  CustomFixtureRules,
  CustomFinalsRules,
} from './customLeague'

export type BrandingPackTheme =
  | 'modern-afl'
  | 'retro-vfl'
  | 'fantasy-expansion'
  | 'state-league'

export interface BrandingPackTeam {
  id: string
  name: string
  fullName: string
  abbreviation: string
  mascot: string
  homeVenue: string
  established: number
  tier: 'large' | 'medium' | 'small'
  colors: {
    primary: string
    secondary: string
    tertiary?: string
  }
  guernseyStyle: GuernseyStyle
  /** IDs of rival teams within this pack */
  rivalIds: string[]
  notes?: string
}

export interface BrandingPackRivalry {
  teamIds: [string, string]
  label: string
}

export interface BrandingPackDefaults {
  model: CustomCompetitionModel
  conferenceCount: number
  ladderRules: CustomLadderRules
  fixtureRules: CustomFixtureRules
  finalsRules: CustomFinalsRules
}

export interface BrandingPack {
  id: BrandingPackTheme
  name: string
  tagline: string
  description: string
  /** Hex color used for pack card accent in the UI */
  accentColor: string
  era: string
  namingConvention: string
  logoStyle: string
  recommendedTeamCount: number
  minTeams: number
  maxTeams: number
  teams: BrandingPackTeam[]
  prominentRivalries: BrandingPackRivalry[]
  defaults: BrandingPackDefaults
}

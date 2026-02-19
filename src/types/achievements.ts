export type AchievementTier = 'bronze' | 'silver' | 'gold'

export type AchievementCategory =
  | 'premiership'
  | 'dynasty'
  | 'club-rebuild'
  | 'player-development'
  | 'draft-scouting'
  | 'awards'
  | 'season-performance'
  | 'youth'
  | 'club-building'
  | 'management'
  | 'records'
  | 'hall-of-fame'

export interface AchievementDef {
  id: string
  category: AchievementCategory
  tier: AchievementTier
  title: string
  description: string
}

export interface UnlockedAchievement {
  defId: string
  year: number
  clubId: string
}

export type CareerObjectiveScope = 'season' | 'multi-season'
export type CareerObjectiveStatus = 'active' | 'completed' | 'expired'

export interface CareerObjective {
  id: string
  type: string
  title: string
  description: string
  scope: CareerObjectiveScope
  assignedYear: number
  expiresYear?: number
  targetValue: number
  currentValue: number
  status: CareerObjectiveStatus
  completedYear?: number
}

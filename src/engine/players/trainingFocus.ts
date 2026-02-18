import type { PlayerAttributes, PlayerTrainingFocus } from '@/types/player'

export const PLAYER_TRAINING_FOCUS_LABELS: Record<PlayerTrainingFocus, string> = {
  endurance: 'Endurance',
  strength: 'Strength',
  kicking: 'Kicking',
  'contested-ball': 'Contested Ball',
  marking: 'Marking',
  tackling: 'Tackling',
  'ruck-craft': 'Ruck Craft',
}

export const PLAYER_TRAINING_FOCUS_OPTIONS: PlayerTrainingFocus[] = [
  'endurance',
  'strength',
  'kicking',
  'contested-ball',
  'marking',
  'tackling',
  'ruck-craft',
]

export const PLAYER_TRAINING_FOCUS_ATTRIBUTES: Record<PlayerTrainingFocus, (keyof PlayerAttributes)[]> = {
  endurance: ['endurance', 'recovery', 'workRate', 'acceleration'],
  strength: ['strength', 'hardness', 'oneOnOne', 'tackling'],
  kicking: ['kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap', 'fieldKicking'],
  'contested-ball': ['contested', 'clearance', 'groundBallGet', 'hardness'],
  marking: ['markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested'],
  tackling: ['tackling', 'pressure', 'hardness', 'oneOnOne'],
  'ruck-craft': ['hitouts', 'ruckCreative', 'followUp', 'centreBounce', 'boundaryThrowIn', 'stoppage'],
}

export function getPlayerTrainingFocusAttributeMultiplier(
  focus: PlayerTrainingFocus | null | undefined,
  key: keyof PlayerAttributes,
  focusedMultiplier = 1.12,
  unfocusedMultiplier = 0.985,
): number {
  if (!focus) return 1
  const focusedKeys = PLAYER_TRAINING_FOCUS_ATTRIBUTES[focus]
  if (!focusedKeys || focusedKeys.length === 0) return 1
  return focusedKeys.includes(key) ? focusedMultiplier : unfocusedMultiplier
}


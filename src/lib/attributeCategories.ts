import type { PlayerAttributes } from '@/types/player'

export const ATTR_CATEGORIES: { label: string; attrs: { key: keyof PlayerAttributes; label: string }[] }[] = [
  {
    label: 'Kicking',
    attrs: [
      { key: 'kickingEfficiency', label: 'Efficiency' },
      { key: 'kickingDistance', label: 'Distance' },
      { key: 'setShot', label: 'Set Shot' },
      { key: 'dropPunt', label: 'Drop Punt' },
      { key: 'snap', label: 'Snap' },
    ],
  },
  {
    label: 'Handball',
    attrs: [
      { key: 'handballEfficiency', label: 'Efficiency' },
      { key: 'handballDistance', label: 'Distance' },
      { key: 'handballReceive', label: 'Receive' },
    ],
  },
  {
    label: 'Marking',
    attrs: [
      { key: 'markingOverhead', label: 'Overhead' },
      { key: 'markingLeading', label: 'Leading' },
      { key: 'markingContested', label: 'Contested' },
      { key: 'markingUncontested', label: 'Uncontested' },
    ],
  },
  {
    label: 'Physical',
    attrs: [
      { key: 'speed', label: 'Speed' },
      { key: 'acceleration', label: 'Acceleration' },
      { key: 'endurance', label: 'Endurance' },
      { key: 'strength', label: 'Strength' },
      { key: 'agility', label: 'Agility' },
      { key: 'leap', label: 'Leap' },
      { key: 'recovery', label: 'Recovery' },
    ],
  },
  {
    label: 'Contested',
    attrs: [
      { key: 'tackling', label: 'Tackling' },
      { key: 'contested', label: 'Contested Ball' },
      { key: 'clearance', label: 'Clearance' },
      { key: 'hardness', label: 'Hardness' },
    ],
  },
  {
    label: 'Game Sense',
    attrs: [
      { key: 'disposalDecision', label: 'Decision Making' },
      { key: 'fieldKicking', label: 'Field Kicking' },
      { key: 'positioning', label: 'Positioning' },
      { key: 'creativity', label: 'Creativity' },
      { key: 'anticipation', label: 'Anticipation' },
      { key: 'composure', label: 'Composure' },
    ],
  },
  {
    label: 'Offensive',
    attrs: [
      { key: 'goalkicking', label: 'Goalkicking' },
      { key: 'groundBallGet', label: 'Ground Ball' },
      { key: 'insideForward', label: 'Inside Forward' },
      { key: 'leadingPatterns', label: 'Leading' },
      { key: 'scoringInstinct', label: 'Scoring Instinct' },
    ],
  },
  {
    label: 'Defensive',
    attrs: [
      { key: 'intercept', label: 'Intercept' },
      { key: 'spoiling', label: 'Spoiling' },
      { key: 'oneOnOne', label: '1-on-1' },
      { key: 'zonalAwareness', label: 'Zonal Awareness' },
      { key: 'rebounding', label: 'Rebounding' },
    ],
  },
  {
    label: 'Ruck',
    attrs: [
      { key: 'hitouts', label: 'Hitouts' },
      { key: 'ruckCreative', label: 'Ruck Creativity' },
      { key: 'followUp', label: 'Follow-up' },
    ],
  },
  {
    label: 'Mental',
    attrs: [
      { key: 'pressure', label: 'Pressure' },
      { key: 'leadership', label: 'Leadership' },
      { key: 'workRate', label: 'Work Rate' },
      { key: 'consistency', label: 'Consistency' },
      { key: 'determination', label: 'Determination' },
      { key: 'teamPlayer', label: 'Team Player' },
      { key: 'clutch', label: 'Clutch' },
    ],
  },
  {
    label: 'Set Pieces',
    attrs: [
      { key: 'centreBounce', label: 'Centre Bounce' },
      { key: 'boundaryThrowIn', label: 'Throw-in' },
      { key: 'stoppage', label: 'Stoppage' },
    ],
  },
]

export function attrColor(val: number): string {
  if (val >= 80) return 'text-green-500'
  if (val >= 65) return 'text-emerald-400'
  if (val >= 50) return 'text-yellow-500'
  if (val >= 35) return 'text-orange-500'
  return 'text-red-500'
}

export function attrBgColor(val: number): string {
  if (val >= 80) return 'bg-green-500'
  if (val >= 65) return 'bg-emerald-400'
  if (val >= 50) return 'bg-yellow-500'
  if (val >= 35) return 'bg-orange-500'
  return 'bg-red-500'
}

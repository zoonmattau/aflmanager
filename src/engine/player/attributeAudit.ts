import type { HiddenAttributes, Player, PlayerAttributes, PlayerPositionType } from '@/types/player'
import { averageAttributes } from '@/engine/contracts/negotiation'
import { MIN_ATTRIBUTE, MAX_ATTRIBUTE } from '@/engine/core/constants'

type AttributeKey = keyof PlayerAttributes
type AttributeStage = 'generation' | 'progression' | 'draft'

interface AttributeCap {
  soft: number
  hard: number
}

type PositionCaps = Partial<Record<AttributeKey, AttributeCap>>

export interface AttributeAuditOptions {
  stage?: AttributeStage
  hiddenAttributes?: HiddenAttributes | null
  targetOverall?: number
  preserveOverall?: boolean
}

export interface AttributeAuditReport {
  issues: string[]
  overallBefore: number
  overallAfter: number
  ninetyPlusBefore: number
  ninetyPlusAfter: number
  isGenerational: boolean
}

const ALL_ATTRIBUTE_KEYS: AttributeKey[] = [
  'kickingEfficiency', 'kickingDistance', 'setShot', 'dropPunt', 'snap',
  'handballEfficiency', 'handballDistance', 'handballReceive',
  'markingOverhead', 'markingLeading', 'markingContested', 'markingUncontested',
  'speed', 'acceleration', 'endurance', 'strength', 'agility', 'leap', 'recovery',
  'tackling', 'contested', 'clearance', 'hardness',
  'disposalDecision', 'fieldKicking', 'positioning', 'creativity', 'anticipation', 'composure',
  'goalkicking', 'groundBallGet', 'insideForward', 'leadingPatterns', 'scoringInstinct',
  'intercept', 'spoiling', 'oneOnOne', 'zonalAwareness', 'rebounding',
  'hitouts', 'ruckCreative', 'followUp',
  'pressure', 'leadership', 'workRate', 'consistency', 'determination', 'teamPlayer', 'clutch',
  'centreBounce', 'boundaryThrowIn', 'stoppage',
]

const RK_KEYS: AttributeKey[] = ['hitouts', 'ruckCreative', 'followUp']
const RUCK_FOOTSKILL_KEYS: AttributeKey[] = [
  'kickingEfficiency', 'kickingDistance', 'fieldKicking', 'dropPunt', 'setShot', 'snap', 'goalkicking',
]

const POSITION_CORE_ATTRIBUTES: Record<PlayerPositionType, AttributeKey[]> = {
  BP: ['spoiling', 'oneOnOne', 'intercept', 'zonalAwareness', 'positioning'],
  FB: ['spoiling', 'oneOnOne', 'intercept', 'markingContested', 'zonalAwareness'],
  HBF: ['fieldKicking', 'rebounding', 'intercept', 'kickingDistance', 'composure'],
  CHB: ['intercept', 'markingContested', 'markingOverhead', 'oneOnOne', 'spoiling'],
  W: ['speed', 'endurance', 'fieldKicking', 'kickingEfficiency', 'positioning'],
  IM: ['contested', 'clearance', 'groundBallGet', 'tackling', 'hardness'],
  OM: ['clearance', 'disposalDecision', 'kickingEfficiency', 'fieldKicking', 'endurance'],
  RK: ['hitouts', 'ruckCreative', 'followUp', 'leap', 'strength'],
  HFF: ['goalkicking', 'leadingPatterns', 'insideForward', 'creativity', 'markingLeading'],
  CHF: ['goalkicking', 'markingContested', 'markingOverhead', 'strength', 'insideForward'],
  FP: ['goalkicking', 'snap', 'speed', 'pressure', 'scoringInstinct'],
  FF: ['goalkicking', 'scoringInstinct', 'insideForward', 'markingContested', 'setShot'],
}

const POSITION_CAPS: Record<PlayerPositionType, PositionCaps> = {
  BP: { hitouts: { soft: 30, hard: 40 }, ruckCreative: { soft: 28, hard: 38 }, followUp: { soft: 38, hard: 50 } },
  FB: { hitouts: { soft: 32, hard: 42 }, ruckCreative: { soft: 30, hard: 40 }, followUp: { soft: 40, hard: 52 } },
  HBF: { hitouts: { soft: 30, hard: 40 }, ruckCreative: { soft: 28, hard: 38 }, followUp: { soft: 38, hard: 50 } },
  CHB: { hitouts: { soft: 40, hard: 52 }, ruckCreative: { soft: 36, hard: 46 }, followUp: { soft: 46, hard: 58 } },
  W: { hitouts: { soft: 26, hard: 36 }, ruckCreative: { soft: 24, hard: 34 }, followUp: { soft: 34, hard: 46 } },
  IM: { hitouts: { soft: 36, hard: 48 }, ruckCreative: { soft: 34, hard: 46 }, followUp: { soft: 42, hard: 56 } },
  OM: { hitouts: { soft: 28, hard: 40 }, ruckCreative: { soft: 26, hard: 36 }, followUp: { soft: 36, hard: 48 } },
  RK: {
    kickingEfficiency: { soft: 74, hard: 82 },
    kickingDistance: { soft: 72, hard: 80 },
    setShot: { soft: 68, hard: 76 },
    dropPunt: { soft: 74, hard: 82 },
    snap: { soft: 64, hard: 74 },
    fieldKicking: { soft: 72, hard: 80 },
    goalkicking: { soft: 68, hard: 76 },
    hitouts: { soft: 90, hard: 97 },
    ruckCreative: { soft: 88, hard: 96 },
    followUp: { soft: 84, hard: 93 },
  },
  HFF: { hitouts: { soft: 30, hard: 42 }, ruckCreative: { soft: 28, hard: 40 }, followUp: { soft: 36, hard: 48 } },
  CHF: { hitouts: { soft: 52, hard: 66 }, ruckCreative: { soft: 48, hard: 62 }, followUp: { soft: 58, hard: 72 } },
  FP: { hitouts: { soft: 22, hard: 32 }, ruckCreative: { soft: 20, hard: 30 }, followUp: { soft: 28, hard: 40 } },
  FF: { hitouts: { soft: 42, hard: 56 }, ruckCreative: { soft: 40, hard: 54 }, followUp: { soft: 50, hard: 66 } },
}

const DEFAULT_CAP: AttributeCap = { soft: 92, hard: 99 }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getCap(position: PlayerPositionType, key: AttributeKey): AttributeCap {
  return POSITION_CAPS[position][key] ?? DEFAULT_CAP
}

function countNinetyPlus(attrs: PlayerAttributes): number {
  return ALL_ATTRIBUTE_KEYS.reduce((count, key) => count + (attrs[key] >= 90 ? 1 : 0), 0)
}

function getSoftDecay(stage: AttributeStage): number {
  if (stage === 'generation') return 0.35
  if (stage === 'draft') return 0.4
  return 0.5
}

function getRuckClusterLimit(position: PlayerPositionType): number {
  if (position === 'RK') return 0
  if (position === 'CHF' || position === 'FF') return 58
  if (position === 'CHB' || position === 'IM' || position === 'HFF') return 46
  return 38
}

function applyClusterAverageCap(
  attrs: PlayerAttributes,
  keys: AttributeKey[],
  maxAverage: number,
): boolean {
  if (maxAverage <= 0) return false
  const currentAvg = keys.reduce((sum, key) => sum + attrs[key], 0) / keys.length
  if (currentAvg <= maxAverage) return false
  const excess = currentAvg - maxAverage
  for (const key of keys) {
    attrs[key] = clamp(attrs[key] - excess, MIN_ATTRIBUTE, MAX_ATTRIBUTE - 1)
  }
  return true
}

function enforceNinetyLimit(
  position: PlayerPositionType,
  attrs: PlayerAttributes,
  maxAllowed: number,
): boolean {
  const over90 = ALL_ATTRIBUTE_KEYS.filter((key) => attrs[key] >= 90)
  if (over90.length <= maxAllowed) return false

  const core = new Set(POSITION_CORE_ATTRIBUTES[position])
  const ranked = over90
    .map((key) => ({
      key,
      keepScore: (core.has(key) ? 2 : 0) + (RK_KEYS.includes(key) && position === 'RK' ? 1 : 0),
      value: attrs[key],
    }))
    .sort((a, b) => {
      if (a.keepScore !== b.keepScore) return a.keepScore - b.keepScore
      return a.value - b.value
    })

  const toTrim = ranked.slice(0, ranked.length - maxAllowed)
  for (const entry of toTrim) {
    attrs[entry.key] = Math.min(attrs[entry.key], 89.8)
  }
  return toTrim.length > 0
}

function rebalanceOverall(
  position: PlayerPositionType,
  attrs: PlayerAttributes,
  targetOverall: number,
): void {
  const core = new Set(POSITION_CORE_ATTRIBUTES[position])
  for (let pass = 0; pass < 6; pass++) {
    const current = averageAttributes(attrs)
    const delta = targetOverall - current
    if (Math.abs(delta) < 0.08) break

    const increasing = delta > 0
    const candidates = ALL_ATTRIBUTE_KEYS
      .map((key) => {
        const cap = getCap(position, key)
        const bound = increasing
          ? (core.has(key) ? cap.hard : Math.min(cap.hard, cap.soft + 6))
          : MIN_ATTRIBUTE
        const room = increasing ? bound - attrs[key] : attrs[key] - bound
        return {
          key,
          room: Math.max(0, room),
          weight: core.has(key) ? 1.8 : 1,
        }
      })
      .filter((entry) => entry.room > 0.001)

    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0)
    if (totalWeight <= 0.001) break

    for (const c of candidates) {
      const change = (delta * c.weight) / totalWeight
      const adjusted = increasing
        ? attrs[c.key] + Math.min(c.room, change)
        : attrs[c.key] - Math.min(c.room, Math.abs(change))
      attrs[c.key] = clamp(adjusted, MIN_ATTRIBUTE, MAX_ATTRIBUTE - 1)
    }
  }
}

export function auditAndNormalizeAttributes(
  position: PlayerPositionType,
  sourceAttributes: PlayerAttributes,
  options?: AttributeAuditOptions,
): { attributes: PlayerAttributes; report: AttributeAuditReport } {
  const stage = options?.stage ?? 'generation'
  const preserveOverall = options?.preserveOverall !== false
  const attrs = { ...sourceAttributes }
  const issues: string[] = []
  const overallBefore = averageAttributes(attrs)
  const ninetyPlusBefore = countNinetyPlus(attrs)

  for (const key of ALL_ATTRIBUTE_KEYS) {
    attrs[key] = clamp(attrs[key], MIN_ATTRIBUTE, MAX_ATTRIBUTE - 1)
  }

  const softDecay = getSoftDecay(stage)
  for (const key of ALL_ATTRIBUTE_KEYS) {
    const cap = getCap(position, key)
    if (attrs[key] > cap.hard) {
      attrs[key] = cap.hard
      issues.push(`Hard cap: ${String(key)}`)
    }
    if (attrs[key] > cap.soft) {
      const excess = attrs[key] - cap.soft
      attrs[key] = cap.soft + excess * softDecay
      issues.push(`Soft cap: ${String(key)}`)
    }
  }

  if (position === 'RK') {
    if (applyClusterAverageCap(attrs, RUCK_FOOTSKILL_KEYS, 76)) {
      issues.push('Implausible ruck footskill cluster corrected')
    }
  } else {
    const maxRuckAverage = getRuckClusterLimit(position)
    if (applyClusterAverageCap(attrs, RK_KEYS, maxRuckAverage)) {
      issues.push('Implausible non-ruck ruckcraft cluster corrected')
    }
  }

  const targetOverall = options?.targetOverall ?? overallBefore
  const potential = options?.hiddenAttributes?.potentialCeiling ?? targetOverall + 6
  const isGenerational = potential >= 94 && targetOverall >= 80
  const isElite = !isGenerational && (targetOverall >= 78 || potential >= 88)
  const maxNinetyPlus = isGenerational ? 6 : isElite ? 4 : 2
  if (enforceNinetyLimit(position, attrs, maxNinetyPlus)) {
    issues.push(`90+ attribute limit applied (${maxNinetyPlus})`)
  }

  if (preserveOverall) {
    rebalanceOverall(position, attrs, targetOverall)
  }

  for (const key of ALL_ATTRIBUTE_KEYS) {
    attrs[key] = Math.round(attrs[key])
  }

  return {
    attributes: attrs,
    report: {
      issues,
      overallBefore,
      overallAfter: averageAttributes(attrs),
      ninetyPlusBefore,
      ninetyPlusAfter: countNinetyPlus(attrs),
      isGenerational,
    },
  }
}

export function auditPlayerAttributesInPlace(
  player: Pick<Player, 'position' | 'attributes'> & { hiddenAttributes?: HiddenAttributes | null },
  options?: Omit<AttributeAuditOptions, 'hiddenAttributes'>,
): AttributeAuditReport {
  const { attributes, report } = auditAndNormalizeAttributes(
    player.position.primary,
    player.attributes,
    {
      ...options,
      hiddenAttributes: player.hiddenAttributes ?? null,
    },
  )
  player.attributes = attributes
  return report
}

import type { DraftProspect } from '@/types/draft'
import type { LineupSlot, Player, PlayerArchetype, PlayerPositionType, PlayerPreferredRole } from '@/types/player'

const ROLE_BY_PRIMARY: Record<PlayerPositionType, PlayerPreferredRole> = {
  BP: 'lockdown-defender',
  FB: 'lockdown-defender',
  HBF: 'rebound-defender',
  CHB: 'intercept-defender',
  W: 'wing-runner',
  IM: 'inside-mid',
  OM: 'outside-mid',
  RK: 'ruck',
  HFF: 'pressure-forward',
  CHF: 'key-forward',
  FP: 'small-forward',
  FF: 'key-forward',
}

const ARCHETYPES_BY_ROLE: Record<PlayerPreferredRole, PlayerArchetype[]> = {
  'inside-mid': ['ball-winner', 'inside-bull'],
  'outside-mid': ['line-breaker', 'outside-runner'],
  'wing-runner': ['line-breaker', 'two-way-wing'],
  'lockdown-defender': ['stopper', 'lockdown-defender'],
  'intercept-defender': ['aerial-interceptor', 'intercept-defender'],
  'rebound-defender': ['rebounder', 'rebound-defender'],
  'pressure-forward': ['forward-pressure', 'small-pressure-forward'],
  'key-forward': ['target-mark', 'power-forward'],
  'small-forward': ['crumber', 'lead-up-forward'],
  ruck: ['tap-specialist', 'mobile-ruck'],
  utility: ['two-way-utility', 'swingman'],
}

const SLOT_ROLE_PREFERENCES: Record<LineupSlot, PlayerPreferredRole[]> = {
  LBP: ['lockdown-defender', 'intercept-defender', 'rebound-defender'],
  RBP: ['lockdown-defender', 'intercept-defender', 'rebound-defender'],
  FB: ['lockdown-defender', 'intercept-defender'],
  LHB: ['rebound-defender', 'intercept-defender', 'wing-runner'],
  RHB: ['rebound-defender', 'intercept-defender', 'wing-runner'],
  CHB: ['intercept-defender', 'lockdown-defender'],
  LW: ['wing-runner', 'outside-mid'],
  RW: ['wing-runner', 'outside-mid'],
  C: ['outside-mid', 'inside-mid'],
  LHF: ['pressure-forward', 'small-forward', 'key-forward'],
  RHF: ['pressure-forward', 'small-forward', 'key-forward'],
  CHF: ['key-forward', 'small-forward'],
  LFP: ['small-forward', 'pressure-forward'],
  RFP: ['small-forward', 'pressure-forward'],
  FF: ['key-forward', 'small-forward'],
  RK: ['ruck'],
  RR: ['inside-mid', 'outside-mid', 'ruck'],
  ROV: ['inside-mid', 'outside-mid'],
  I1: ['inside-mid', 'outside-mid', 'wing-runner', 'pressure-forward', 'rebound-defender'],
  I2: ['inside-mid', 'outside-mid', 'wing-runner', 'pressure-forward', 'rebound-defender'],
  I3: ['inside-mid', 'outside-mid', 'wing-runner', 'pressure-forward', 'rebound-defender'],
  I4: ['inside-mid', 'outside-mid', 'wing-runner', 'pressure-forward', 'rebound-defender'],
  I5: ['inside-mid', 'outside-mid', 'wing-runner', 'pressure-forward', 'rebound-defender'],
  I6: ['inside-mid', 'outside-mid', 'wing-runner', 'pressure-forward', 'rebound-defender'],
  I7: ['inside-mid', 'outside-mid', 'wing-runner', 'pressure-forward', 'rebound-defender'],
  I8: ['inside-mid', 'outside-mid', 'wing-runner', 'pressure-forward', 'rebound-defender'],
}

const ROLE_IDEAL_COUNTS: Record<PlayerPreferredRole, number> = {
  'inside-mid': 4,
  'outside-mid': 3,
  'wing-runner': 2,
  'lockdown-defender': 3,
  'intercept-defender': 2,
  'rebound-defender': 2,
  'pressure-forward': 3,
  'key-forward': 3,
  'small-forward': 2,
  ruck: 2,
  utility: 2,
}

export function mapPrimaryPositionToPreferredRole(primary: PlayerPositionType): PlayerPreferredRole {
  return ROLE_BY_PRIMARY[primary] ?? 'utility'
}

export function pickArchetypeForRole(role: PlayerPreferredRole, random01: number): PlayerArchetype {
  const list = ARCHETYPES_BY_ROLE[role] ?? ARCHETYPES_BY_ROLE.utility
  if (list.length === 0) return 'two-way-utility'
  const idx = Math.max(0, Math.min(list.length - 1, Math.floor(random01 * list.length)))
  return list[idx]
}

export function getRoleFitMultiplierForSlot(role: PlayerPreferredRole, slot: LineupSlot): number {
  const prefs = SLOT_ROLE_PREFERENCES[slot] ?? []
  const idx = prefs.indexOf(role)
  if (idx === 0) return 1.12
  if (idx === 1) return 1.06
  if (idx === 2) return 1.02
  return 0.9
}

export function roleNeedsByClub(players: Record<string, Player>, clubId: string): Record<PlayerPreferredRole, number> {
  const counts = {} as Record<PlayerPreferredRole, number>
  for (const role of Object.keys(ROLE_IDEAL_COUNTS) as PlayerPreferredRole[]) {
    counts[role] = 0
  }
  for (const p of Object.values(players)) {
    if (p.clubId !== clubId) continue
    const role = p.preferredRole ?? mapPrimaryPositionToPreferredRole(p.position.primary)
    counts[role] = (counts[role] ?? 0) + 1
  }
  const deficits = {} as Record<PlayerPreferredRole, number>
  for (const role of Object.keys(ROLE_IDEAL_COUNTS) as PlayerPreferredRole[]) {
    deficits[role] = Math.max(0, ROLE_IDEAL_COUNTS[role] - (counts[role] ?? 0))
  }
  return deficits
}

export function getRoleNeedBonus(role: PlayerPreferredRole, deficits: Record<PlayerPreferredRole, number>): number {
  const deficit = deficits[role] ?? 0
  if (deficit <= 0) return 0
  return Math.min(12, deficit * 4)
}

export function mapDraftProspectToPreferredRole(prospect: DraftProspect): PlayerPreferredRole {
  if (prospect.role === 'shutdown') return 'lockdown-defender'
  if (prospect.role === 'ball-winner') return 'inside-mid'
  if (prospect.role === 'line-breaker') return prospect.position.primary === 'W' ? 'wing-runner' : 'outside-mid'
  if (prospect.role === 'ground-pressure') return 'pressure-forward'
  if (prospect.role === 'contested-mark' || prospect.role === 'aerial-threat') return 'key-forward'
  if (prospect.role === 'ruck-craft') return 'ruck'

  if (prospect.archetype === 'intercept-defender') return 'intercept-defender'
  if (prospect.archetype === 'rebound-defender') return 'rebound-defender'
  if (prospect.archetype === 'small-pressure-forward') return 'pressure-forward'
  if (prospect.archetype === 'tap-ruck' || prospect.archetype === 'mobile-ruck') return 'ruck'
  if (prospect.archetype === 'power-forward' || prospect.archetype === 'lead-up-forward') return 'key-forward'
  if (prospect.archetype === 'outside-runner' || prospect.archetype === 'two-way-wing') return 'outside-mid'
  if (prospect.archetype === 'inside-bull') return 'inside-mid'
  return mapPrimaryPositionToPreferredRole(prospect.position.primary)
}

export function getRoleSimulationMultiplier(role: PlayerPreferredRole, phase: 'general' | 'scoring' | 'defense' | 'contested' | 'ruck'): number {
  switch (phase) {
    case 'scoring':
      if (role === 'key-forward') return 1.18
      if (role === 'small-forward' || role === 'pressure-forward') return 1.08
      return 0.95
    case 'defense':
      if (role === 'intercept-defender' || role === 'lockdown-defender' || role === 'rebound-defender') return 1.14
      if (role === 'pressure-forward') return 1.05
      return 0.95
    case 'contested':
      if (role === 'inside-mid' || role === 'ruck') return 1.14
      return 0.98
    case 'ruck':
      return role === 'ruck' ? 1.22 : 0.86
    default:
      if (role === 'utility') return 1.02
      return 1
  }
}


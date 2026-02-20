import type { Player, PlayerPositionType, PlayerPreferredRole } from '@/types/player'
import { getOverallRating, getPlayerPositionRating } from '@/engine/player/playerRating'
import { isPlayerSuspended } from '@/engine/players/availability'
import { roleNeedsByClub } from '@/engine/player/roles'

type NeedAction = {
  label: string
  linkTo: string
}

export type ClubNeed = {
  id: string
  area: 'position' | 'role'
  key: string
  label: string
  depth: number
  targetDepth: number
  availableNow: number
  priorityScore: number
  severity: 'high' | 'medium' | 'low'
  reasons: string[]
  actions: NeedAction[]
}

export type ClubListNeedsReport = {
  priorityNeeds: ClubNeed[]
  positionNeeds: ClubNeed[]
  roleNeeds: ClubNeed[]
}

const POSITION_TARGET_DEPTH: Record<PlayerPositionType, number> = {
  BP: 3,
  FB: 3,
  HBF: 4,
  CHB: 3,
  W: 3,
  IM: 6,
  OM: 5,
  RK: 3,
  HFF: 4,
  CHF: 3,
  FP: 3,
  FF: 3,
}

const POSITION_LABELS: Record<PlayerPositionType, string> = {
  BP: 'Back Pocket',
  FB: 'Full Back',
  HBF: 'Half-Back Flank',
  CHB: 'Centre Half-Back',
  W: 'Wing',
  IM: 'Inside Mid',
  OM: 'Outside Mid',
  RK: 'Ruck',
  HFF: 'Half-Forward Flank',
  CHF: 'Centre Half-Forward',
  FP: 'Forward Pocket',
  FF: 'Full Forward',
}

const ROLE_LABELS: Record<PlayerPreferredRole, string> = {
  'inside-mid': 'Inside Mid',
  'outside-mid': 'Outside Mid',
  'wing-runner': 'Wing Runner',
  'lockdown-defender': 'Lockdown Defender',
  'intercept-defender': 'Intercept Defender',
  'rebound-defender': 'Rebound Defender',
  'pressure-forward': 'Pressure Forward',
  'key-forward': 'Key Forward',
  'small-forward': 'Small Forward',
  ruck: 'Ruck',
  utility: 'Utility',
}

function toSeverity(score: number): ClubNeed['severity'] {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

function weightForPosition(player: Player, pos: PlayerPositionType): number {
  if (player.position.primary === pos) return 1
  if (player.position.secondary.includes(pos)) return 0.6
  const rated = getPlayerPositionRating(player, pos)
  if (rated >= 70) return 0.45
  if (rated >= 55) return 0.25
  return 0
}

function buildPositionNeed(pos: PlayerPositionType, players: Player[]): ClubNeed | null {
  const eligible = players
    .map((p) => ({ player: p, weight: weightForPosition(p, pos), overall: getOverallRating(p) }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.overall - a.overall)

  const depth = Number(eligible.reduce((sum, x) => sum + x.weight, 0).toFixed(1))
  const targetDepth = POSITION_TARGET_DEPTH[pos]
  const availableNow = eligible.filter(({ player }) => !player.injury && !isPlayerSuspended(player) && player.fitness >= 60).length
  const top3 = eligible.slice(0, 3)
  const top3Avg = top3.length > 0
    ? top3.reduce((sum, x) => sum + x.overall, 0) / top3.length
    : 0

  const depthGap = Math.max(0, targetDepth - depth)
  const qualityGap = Math.max(0, 62 - top3Avg)
  const availabilityGap = Math.max(0, 2 - availableNow)
  const expiringVets = eligible.filter(({ player }) => player.age >= 30 && player.contract.yearsRemaining <= 1).length

  const priorityScore = Math.round(
    depthGap * 34 +
    qualityGap * 1.25 +
    availabilityGap * 18 +
    expiringVets * 6,
  )

  if (priorityScore < 20) return null

  const reasons: string[] = []
  if (depthGap >= 1) reasons.push(`Depth short by ${depthGap.toFixed(1)} players`)
  if (qualityGap >= 6) reasons.push(`Top-end quality trending low (${top3Avg.toFixed(1)} OVR avg)`)
  if (availabilityGap >= 1) reasons.push(`Only ${availableNow} match-ready options`)
  if (expiringVets >= 2) reasons.push(`${expiringVets} veteran contracts expiring soon`)

  const actions: NeedAction[] = []
  if (depthGap >= 1.2) {
    actions.push({ label: 'Target In Draft', linkTo: '/draft' })
    actions.push({ label: 'Scout This Line', linkTo: '/scouting' })
  } else if (qualityGap >= 8) {
    actions.push({ label: 'Trade Upgrade', linkTo: '/trades' })
    actions.push({ label: 'Check Free Agency', linkTo: '/offseason' })
  } else if (expiringVets >= 2) {
    actions.push({ label: 'Review Contracts', linkTo: '/contracts' })
  } else {
    actions.push({ label: 'Review Squad', linkTo: '/squad' })
    actions.push({ label: 'Adjust Lineup', linkTo: '/lineup' })
  }

  return {
    id: `pos-${pos}`,
    area: 'position',
    key: pos,
    label: POSITION_LABELS[pos],
    depth,
    targetDepth,
    availableNow,
    priorityScore,
    severity: toSeverity(priorityScore),
    reasons,
    actions,
  }
}

function buildRoleNeed(role: PlayerPreferredRole, deficit: number, players: Player[]): ClubNeed | null {
  if (deficit <= 0) return null
  const rolePlayers = players
    .filter((p) => (p.preferredRole ?? 'utility') === role)
    .sort((a, b) => getOverallRating(b) - getOverallRating(a))
  const depth = rolePlayers.length
  const top2 = rolePlayers.slice(0, 2)
  const top2Avg = top2.length > 0 ? top2.reduce((sum, p) => sum + getOverallRating(p), 0) / top2.length : 0
  const availableNow = rolePlayers.filter((p) => !p.injury && !isPlayerSuspended(p) && p.fitness >= 60).length
  const qualityGap = Math.max(0, 64 - top2Avg)
  const priorityScore = Math.round(deficit * 36 + qualityGap * 1.1 + Math.max(0, 2 - availableNow) * 12)
  if (priorityScore < 20) return null

  const reasons: string[] = [`Role shortfall: ${deficit}`]
  if (qualityGap >= 8) reasons.push(`Low high-end role quality (${top2Avg.toFixed(1)} OVR avg)`)
  if (availableNow <= 1) reasons.push(`Thin match-ready coverage (${availableNow} available)`)

  const actions: NeedAction[] = [
    { label: 'Scout Role Fits', linkTo: '/scouting' },
    { label: 'Trade For Fit', linkTo: '/trades' },
  ]
  if (deficit >= 2) actions.unshift({ label: 'Prioritise In Draft', linkTo: '/draft' })

  return {
    id: `role-${role}`,
    area: 'role',
    key: role,
    label: ROLE_LABELS[role],
    depth,
    targetDepth: depth + deficit,
    availableNow,
    priorityScore,
    severity: toSeverity(priorityScore),
    reasons,
    actions,
  }
}

export function analyzeClubListNeeds(playersById: Record<string, Player>, clubId: string): ClubListNeedsReport {
  const clubPlayers = Object.values(playersById).filter((p) => p.clubId === clubId)

  const positionNeeds = (Object.keys(POSITION_TARGET_DEPTH) as PlayerPositionType[])
    .map((pos) => buildPositionNeed(pos, clubPlayers))
    .filter((x): x is ClubNeed => Boolean(x))
    .sort((a, b) => b.priorityScore - a.priorityScore)

  const deficits = roleNeedsByClub(playersById, clubId)
  const roleNeeds = (Object.keys(deficits) as PlayerPreferredRole[])
    .filter((role) => role !== 'utility')
    .map((role) => buildRoleNeed(role, deficits[role] ?? 0, clubPlayers))
    .filter((x): x is ClubNeed => Boolean(x))
    .sort((a, b) => b.priorityScore - a.priorityScore)

  const priorityNeeds = [...positionNeeds, ...roleNeeds]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 8)

  return { priorityNeeds, positionNeeds, roleNeeds }
}

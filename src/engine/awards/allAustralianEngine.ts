import type { Player } from '@/types/player'
import type { LadderEntry } from '@/types/season'
import type {
  AAPositionGroup,
  AATeamSlotLabel,
  AllAustralianNomination,
  AllAustralianTeamMember,
} from '@/types/allAustralian'
import { getOverallRating } from '@/engine/player/playerRating'

// ── Position mapping ────────────────────────────────────────────────────────

const DEF_POSITIONS = new Set(['BP', 'FB', 'HBF', 'CHB'])
const MID_POSITIONS = new Set(['W', 'IM', 'OM'])
const RUC_POSITIONS = new Set(['RK'])
const FWD_POSITIONS = new Set(['HFF', 'CHF', 'FP', 'FF'])

export function getAAPositionGroup(primary: string): AAPositionGroup {
  if (DEF_POSITIONS.has(primary)) return 'DEF'
  if (MID_POSITIONS.has(primary)) return 'MID'
  if (RUC_POSITIONS.has(primary)) return 'RUC'
  if (FWD_POSITIONS.has(primary)) return 'FWD'
  return 'MID' // fallback for unlisted positions
}

// ── Scoring ─────────────────────────────────────────────────────────────────

/** Ladder-position bonus: top-4 clubs get a larger boost, top-8 a smaller one. */
function teamBonus(clubId: string, top4: Set<string>, top8: Set<string>): number {
  if (top4.has(clubId)) return 1.20
  if (top8.has(clubId)) return 1.10
  return 1.00
}

/** Overall-rating (reputation) bonus. */
function ratingBonus(overall: number): number {
  if (overall >= 88) return 1.08
  if (overall >= 80) return 1.05
  if (overall >= 72) return 1.02
  return 1.00
}

function score(player: Player, group: AAPositionGroup, t4: Set<string>, t8: Set<string>): number {
  const gp = player.seasonStats.gamesPlayed
  if (gp < 10) return 0

  const s = player.seasonStats
  const avgDisp = s.disposals / gp
  const avgGoals = s.goals / gp
  const avgMarks = s.marks / gp
  const avgTackles = s.tackles / gp
  const avgClear = s.clearances / gp
  const avgInter = s.intercepts / gp
  const avgHO = s.hitouts / gp
  const avgCP = s.contestedPossessions / gp
  const avgI50 = s.insideFifties / gp
  const avgR50 = s.rebound50s / gp
  const avgSI = s.scoreInvolvements / gp
  const avgGA = s.goalAssists / gp

  const overall = getOverallRating(player)
  const tb = teamBonus(player.clubId, t4, t8)
  const rb = ratingBonus(overall)

  let raw = 0
  switch (group) {
    case 'DEF':
      raw = avgInter * 3.5 + avgR50 * 2.5 + avgMarks * 1.5 + avgDisp * 0.8 + avgTackles * 0.6 + avgCP * 0.5
      break
    case 'MID':
      raw = avgDisp * 1.5 + avgClear * 2.5 + avgCP * 0.8 + avgI50 * 1.2 + avgGoals * 1.5 + avgTackles * 0.8
      break
    case 'RUC':
      raw = avgHO * 2.5 + avgClear * 2.0 + avgCP * 1.0 + avgDisp * 0.5 + avgTackles * 0.5
      break
    case 'FWD':
      raw = avgGoals * 4.0 + avgI50 * 1.5 + avgMarks * 1.5 + avgDisp * 0.8 + avgSI * 0.8 + avgGA * 1.5
      break
  }

  return raw * tb * rb
}

// ── Squad nomination (40-man) ────────────────────────────────────────────────

/** Squad composition: 12 DEF, 14 MID, 4 RUC, 10 FWD = 40 */
const SQUAD_QUOTAS: Record<AAPositionGroup, number> = {
  DEF: 12,
  MID: 14,
  RUC: 4,
  FWD: 10,
}

export function generateAA40Squad(
  players: Record<string, Player>,
  ladder: LadderEntry[],
): AllAustralianNomination[] {
  const top4 = new Set(ladder.slice(0, 4).map((e) => e.clubId))
  const top8 = new Set(ladder.slice(0, 8).map((e) => e.clubId))

  const eligible = Object.values(players).filter(
    (p) => p.seasonStats.gamesPlayed >= 10 && p.clubId,
  )

  // Group by position, score, and pick top N per group
  const groups: Record<AAPositionGroup, Array<{ player: Player; sc: number }>> = {
    DEF: [],
    MID: [],
    RUC: [],
    FWD: [],
  }

  for (const p of eligible) {
    const group = getAAPositionGroup(p.position.primary)
    const sc = score(p, group, top4, top8)
    if (sc > 0) {
      groups[group].push({ player: p, sc })
    }
  }

  const squad: AllAustralianNomination[] = []

  for (const group of (['DEF', 'MID', 'RUC', 'FWD'] as AAPositionGroup[])) {
    const sorted = groups[group].sort((a, b) => b.sc - a.sc)
    const topN = sorted.slice(0, SQUAD_QUOTAS[group])
    for (const { player, sc } of topN) {
      const gp = player.seasonStats.gamesPlayed
      const s = player.seasonStats
      squad.push({
        playerId: player.id,
        playerName: `${player.firstName} ${player.lastName}`,
        clubId: player.clubId,
        positionGroup: group,
        primaryPosition: player.position.primary,
        score: Math.round(sc * 10) / 10,
        gamesPlayed: gp,
        avgDisposals: +(s.disposals / gp).toFixed(1),
        avgGoals: +(s.goals / gp).toFixed(1),
        avgMarks: +(s.marks / gp).toFixed(1),
        avgTackles: +(s.tackles / gp).toFixed(1),
        avgClearances: +(s.clearances / gp).toFixed(1),
        avgIntercepts: +(s.intercepts / gp).toFixed(1),
        avgHitouts: +(s.hitouts / gp).toFixed(1),
        avgContested: +(s.contestedPossessions / gp).toFixed(1),
        avgInsideFifties: +(s.insideFifties / gp).toFixed(1),
        avgRebound50s: +(s.rebound50s / gp).toFixed(1),
        overallRating: getOverallRating(player),
      })
    }
  }

  return squad
}

// ── Final team selection (22 from 40) ───────────────────────────────────────

/**
 * Named slot positions and their groups.
 * 18 named on the ground + 4 interchange = 22.
 */
const BACK_SLOTS: AATeamSlotLabel[] = [
  'Full-back',
  'Centre Half-back',
  'Left Half-back',
  'Right Half-back',
  'Left Back Pocket',
  'Right Back Pocket',
]
const MID_SLOTS: AATeamSlotLabel[] = [
  'Centre',
  'Left Wing',
  'Right Wing',
  'Ruck-Rover',
  'Rover',
]
const RUC_SLOTS: AATeamSlotLabel[] = ['Ruck']
const FWD_SLOTS: AATeamSlotLabel[] = [
  'Full-forward',
  'Centre Half-forward',
  'Left Half-forward',
  'Right Half-forward',
  'Left Forward Pocket',
  'Right Forward Pocket',
]

export function selectAAFinalTeam(
  squad: AllAustralianNomination[],
): AllAustralianTeamMember[] {
  const byGroup = (g: AAPositionGroup) =>
    squad.filter((n) => n.positionGroup === g).sort((a, b) => b.score - a.score)

  const defs = byGroup('DEF')
  const mids = byGroup('MID')
  const rucs = byGroup('RUC')
  const fwds = byGroup('FWD')

  const team: AllAustralianTeamMember[] = []
  const usedIds = new Set<string>()

  function assign(nomination: AllAustralianNomination | undefined, slot: AATeamSlotLabel) {
    if (!nomination) return
    team.push({
      playerId: nomination.playerId,
      playerName: nomination.playerName,
      clubId: nomination.clubId,
      positionGroup: nomination.positionGroup,
      slotLabel: slot,
      isCaptain: false,
      score: nomination.score,
    })
    usedIds.add(nomination.playerId)
  }

  // Fill named back slots (top 6 defenders)
  defs.slice(0, 6).forEach((n, i) => assign(n, BACK_SLOTS[i]))

  // Fill named mid slots (top 5 midfielders)
  mids.slice(0, 5).forEach((n, i) => assign(n, MID_SLOTS[i]))

  // Fill ruck slot (top 1 ruck)
  rucs.slice(0, 1).forEach((n, i) => assign(n, RUC_SLOTS[i]))

  // Fill named forward slots (top 6 forwards)
  fwds.slice(0, 6).forEach((n, i) => assign(n, FWD_SLOTS[i]))

  // Interchange: 4 best remaining from any group, in score order
  const remaining = squad
    .filter((n) => !usedIds.has(n.playerId))
    .sort((a, b) => b.score - a.score)
  remaining.slice(0, 4).forEach((n) => assign(n, 'Interchange'))

  // Captain = highest-scoring player in the team
  if (team.length > 0) {
    const best = [...team].sort((a, b) => b.score - a.score)[0]
    const captainIdx = team.findIndex((m) => m.playerId === best.playerId)
    if (captainIdx >= 0) team[captainIdx].isCaptain = true
  }

  return team
}

/** Returns the AA team player IDs (final 22) for use in existing award records. */
export function aaTeamToPlayerIds(team: AllAustralianTeamMember[]): string[] {
  return team.map((m) => m.playerId)
}

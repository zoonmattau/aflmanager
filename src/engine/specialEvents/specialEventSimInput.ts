/**
 * Builds a SimulateMatchInput from a SpecialEventInstance so it can be run
 * through the same interactive LiveMatchView as regular AFL matches.
 *
 * Virtual club IDs (e.g. "spe-<id>-A" / "spe-<id>-B") are created so the
 * match engine can distinguish the two squads.  Player records are shallow-
 * copied with their clubId remapped to the virtual IDs — the originals in the
 * store are never mutated.
 */

import type { SimulateMatchInput } from '@/engine/match/simulateMatch'
import type { SpecialEventInstance } from '@/types/specialEvents'
import type { Club } from '@/types/club'
import type { Player } from '@/types/player'

function makeVirtualClub(id: string, name: string): Club {
  return {
    id,
    name,
    fullName: name,
    abbreviation: name.split(' ').map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 4) || name.slice(0, 4).toUpperCase(),
    mascot: '',
    homeGround: '',
    established: 1900,
    premierships: 0,
    tier: 'medium',
    colors: { primary: '#888888', secondary: '#ffffff' },
    facilities: { trainingGround: 3, gym: 3, medicalCentre: 3, recoveryPool: 3, analysisSuite: 3, youthAcademy: 3 },
    finances: { salaryCap: 13_000_000, currentSpend: 0, revenue: 0, expenses: 0, balance: 0 },
    draftPicks: [],
    gameplan: {
      tempo: 'medium',
      aggression: 'medium',
      defensiveLine: 'hold',
      centreTactic: 'balanced',
      stoppageTactic: 'balanced',
      offensiveStyle: 'balanced',
      kickInTactic: 'play-on-short',
      midfieldLine: 'hold',
      forwardLine: 'hold',
      ruckNomination: { primaryRuckId: null, backupRuckId: null, aroundTheGround: false },
      rotations: 'medium',
    },
    tacticalIdentity: 'contested',
    leadership: { captainId: null, viceCaptainId: null, leadershipGroupIds: [] },
    aiPersonality: {
      competitiveWindow: 'balanced',
      draftPhilosophy: 'best-available',
      riskTolerance: 'moderate',
      tradeActivity: 'moderate',
    },
  }
}

export function buildSpecialEventSimInput(
  instance: SpecialEventInstance,
  allPlayers: Record<string, Player>,
  rngSeed: number,
): SimulateMatchInput {
  const homeClubId = `spe-${instance.id}-A`
  const awayClubId  = `spe-${instance.id}-B`

  // Shallow-copy players with remapped clubIds (store is never mutated)
  const simPlayers: Record<string, Player> = {}
  for (const pid of instance.teamA.playerIds) {
    const p = allPlayers[pid]
    if (p) simPlayers[pid] = { ...p, clubId: homeClubId }
  }
  for (const pid of instance.teamB.playerIds) {
    const p = allPlayers[pid]
    if (p) simPlayers[pid] = { ...p, clubId: awayClubId }
  }

  const simClubs: Record<string, Club> = {
    [homeClubId]: makeVirtualClub(homeClubId, instance.teamA.name),
    [awayClubId]: makeVirtualClub(awayClubId, instance.teamB.name),
  }

  return {
    homeClubId,
    awayClubId,
    venue: instance.venue,
    round: 0,
    players: simPlayers,
    clubs: simClubs,
    seed: rngSeed ^ (instance.id.length * 7919),
    homeLineupPlayerIds: instance.teamA.playerIds,
    awayLineupPlayerIds: instance.teamB.playerIds,
    injuryFrequency: 'low', // exhibition match — fewer injuries
  }
}

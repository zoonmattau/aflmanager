import type { Player } from '@/types/player'
import type { ClubGameplan } from '@/types/club'
import type { SeededRNG } from '@/engine/core/rng'
import { POSITION_LINE } from '@/engine/core/constants'

/**
 * Generate a gameplan for an AI-controlled club based on its squad composition.
 * Uses seeded RNG for variety so different AI clubs play differently.
 */
export function generateAIGameplan(
  clubId: string,
  players: Record<string, Player>,
  rng: SeededRNG,
): ClubGameplan {
  // Get this club's players
  const squad = Object.values(players).filter((p) => p.clubId === clubId)

  // Count players by position line
  const lineCounts = { DEF: 0, MID: 0, FWD: 0, RK: 0 }
  for (const p of squad) {
    const line = POSITION_LINE[p.position.primary]
    lineCounts[line]++
  }

  // Compute average attributes across squad for key traits
  const avgAttribute = (getter: (p: Player) => number): number => {
    if (squad.length === 0) return 50
    return squad.reduce((sum, p) => sum + getter(p), 0) / squad.length
  }

  const avgSpeed = avgAttribute((p) => p.attributes.speed)
  const avgEndurance = avgAttribute((p) => p.attributes.endurance)
  const avgContested = avgAttribute((p) => p.attributes.contested)
  const avgTackling = avgAttribute((p) => p.attributes.tackling)
  const avgMarkingOverhead = avgAttribute((p) => p.attributes.markingOverhead)
  const avgKickingDistance = avgAttribute((p) => p.attributes.kickingDistance)
  const avgWorkRate = avgAttribute((p) => p.attributes.workRate)
  const avgStrength = avgAttribute((p) => p.attributes.strength)

  // Count tall forwards (CHF, FF with height > 190)
  const tallForwards = squad.filter(
    (p) =>
      (p.position.primary === 'CHF' || p.position.primary === 'FF') &&
      p.height > 190,
  ).length

  // Count ruckmen
  const ruckmen = squad.filter((p) => p.position.primary === 'RK')

  // --- Offensive Style ---
  let offensiveStyle: ClubGameplan['offensiveStyle'] = 'balanced'
  if (lineCounts.FWD > 12 || avgMarkingOverhead > 60) {
    offensiveStyle = 'attacking'
  } else if (lineCounts.DEF > 12 || avgTackling > 60) {
    offensiveStyle = 'defensive'
  }
  // Random override (20% chance)
  if (rng.chance(0.2)) {
    offensiveStyle = rng.pick(['attacking', 'balanced', 'defensive'])
  }

  // --- Tempo ---
  let tempo: ClubGameplan['tempo'] = 'medium'
  if (avgSpeed > 60 && avgEndurance > 55) {
    tempo = 'fast'
  } else if (avgSpeed < 45) {
    tempo = 'slow'
  }
  if (rng.chance(0.15)) {
    tempo = rng.pick(['fast', 'medium', 'slow'])
  }

  // --- Aggression ---
  let aggression: ClubGameplan['aggression'] = 'medium'
  if (avgContested > 58 && avgStrength > 55) {
    aggression = 'high'
  } else if (avgContested < 45) {
    aggression = 'low'
  }
  if (rng.chance(0.15)) {
    aggression = rng.pick(['high', 'medium', 'low'])
  }

  // --- Kick-In Tactic ---
  let kickInTactic: ClubGameplan['kickInTactic'] = 'set-up-short'
  if (tallForwards >= 3 && avgKickingDistance > 55) {
    kickInTactic = 'set-up-long'
  } else if (avgSpeed > 58) {
    kickInTactic = 'play-on-short'
  } else if (tallForwards >= 2 && avgSpeed > 55) {
    kickInTactic = 'play-on-long'
  }
  if (rng.chance(0.2)) {
    kickInTactic = rng.pick(['play-on-short', 'play-on-long', 'set-up-short', 'set-up-long'])
  }

  // --- Centre Tactic ---
  let centreTactic: ClubGameplan['centreTactic'] = 'balanced'
  if (avgContested > 58) {
    centreTactic = 'cluster'
  } else if (avgSpeed > 58) {
    centreTactic = 'spread'
  }
  if (rng.chance(0.2)) {
    centreTactic = rng.pick(['spread', 'cluster', 'balanced'])
  }

  // --- Stoppage Tactic ---
  let stoppageTactic: ClubGameplan['stoppageTactic'] = 'balanced'
  if (avgContested > 55 && avgStrength > 55) {
    stoppageTactic = 'cluster'
  } else if (avgSpeed > 55 && avgWorkRate > 55) {
    stoppageTactic = 'spread'
  }
  if (rng.chance(0.2)) {
    stoppageTactic = rng.pick(['spread', 'cluster', 'balanced'])
  }

  // --- Line Tactics ---
  const pickLineTactic = (bias: 'press' | 'hold' | 'run' | 'zone'): ClubGameplan['defensiveLine'] => {
    if (rng.chance(0.25)) {
      return rng.pick(['press', 'hold', 'run', 'zone'])
    }
    return bias
  }

  let defBias: ClubGameplan['defensiveLine'] = 'zone'
  if (avgTackling > 58) defBias = 'press'
  else if (avgSpeed > 58) defBias = 'run'
  else if (avgMarkingOverhead > 58) defBias = 'hold'

  let midBias: ClubGameplan['midfieldLine'] = 'run'
  if (avgContested > 58) midBias = 'press'
  else if (avgWorkRate > 58) midBias = 'run'
  else if (avgTackling > 55) midBias = 'zone'

  let fwdBias: ClubGameplan['forwardLine'] = 'press'
  if (tallForwards >= 3) fwdBias = 'hold'
  else if (avgSpeed > 58) fwdBias = 'run'
  else if (avgWorkRate > 58) fwdBias = 'press'

  const defensiveLine = pickLineTactic(defBias)
  const midfieldLine = pickLineTactic(midBias)
  const forwardLine = pickLineTactic(fwdBias)

  // --- Ruck Nomination ---
  // Sort ruckmen by their hitouts attribute to pick the best
  const sortedRucks = [...ruckmen].sort(
    (a, b) => b.attributes.hitouts - a.attributes.hitouts,
  )
  const primaryRuckId = sortedRucks[0]?.id ?? null
  const backupRuckId = sortedRucks[1]?.id ?? null
  const aroundTheGround = rng.chance(0.3)

  // --- Rotations ---
  let rotations: ClubGameplan['rotations'] = 'medium'
  if (avgEndurance > 60) {
    rotations = 'low' // fit team, less need for rotation
  } else if (avgEndurance < 45) {
    rotations = 'high'
  }
  if (rng.chance(0.2)) {
    rotations = rng.pick(['low', 'medium', 'high'])
  }

  return {
    offensiveStyle,
    tempo,
    aggression,
    kickInTactic,
    centreTactic,
    stoppageTactic,
    defensiveLine,
    midfieldLine,
    forwardLine,
    ruckNomination: {
      primaryRuckId,
      backupRuckId,
      aroundTheGround,
    },
    rotations,
  }
}

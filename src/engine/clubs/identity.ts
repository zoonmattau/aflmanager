import type { Club, ClubIdentity, ClubIdentityType } from '@/types/club'
import type { Player } from '@/types/player'
import type { SeededRNG } from '@/engine/core/rng'
import { averageAttributes } from '@/engine/contracts/negotiation'

const IDENTITY_KEYS: ClubIdentityType[] = [
  'youth-development',
  'star-chasing',
  'defensive-powerhouse',
]

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function zeroIdentityScores(): Record<ClubIdentityType, number> {
  return {
    'youth-development': 0,
    'star-chasing': 0,
    'defensive-powerhouse': 0,
  }
}

export function getClubIdentityLabel(identity: ClubIdentityType): string {
  switch (identity) {
    case 'youth-development':
      return 'Youth Development Club'
    case 'star-chasing':
      return 'Star-Chasing Club'
    case 'defensive-powerhouse':
      return 'Defensive Powerhouse'
  }
}

export function getFanExpectationLabel(expectation: ClubIdentity['fanExpectation']): string {
  switch (expectation) {
    case 'patience':
      return 'Patience During Build'
    case 'progress':
      return 'Visible Year-on-Year Progress'
    case 'finals':
      return 'Finals Qualification'
    case 'contend':
      return 'Premiership Contention'
  }
}

export function createInitialClubIdentity(club: Club, currentYear: number): ClubIdentity {
  let current: ClubIdentityType
  if (club.tacticalIdentity === 'defensive' || club.gameplan.offensiveStyle === 'defensive') {
    current = 'defensive-powerhouse'
  } else if (
    club.aiPersonality.competitiveWindow === 'rebuilding' ||
    club.aiPersonality.draftPhilosophy === 'high-upside'
  ) {
    current = 'youth-development'
  } else {
    current = 'star-chasing'
  }

  const scores = zeroIdentityScores()
  scores[current] = 65
  for (const k of IDENTITY_KEYS) {
    if (k !== current) scores[k] = 48
  }

  return {
    current,
    previous: null,
    scores,
    momentum: 0,
    fanExpectation: current === 'star-chasing' ? 'finals' : current === 'defensive-powerhouse' ? 'finals' : 'progress',
    lastEvolvedYear: currentYear,
  }
}

export function getClubIdentity(club: Club, currentYear = 2026): ClubIdentity {
  return club.identity ?? createInitialClubIdentity(club, currentYear)
}

function computeRosterProfile(
  players: Record<string, Player>,
  clubId: string,
): { youthRatio: number; primeRatio: number; avgOverall: number } {
  const roster = Object.values(players).filter((p) => p.clubId === clubId)
  if (roster.length === 0) {
    return { youthRatio: 0.3, primeRatio: 0.45, avgOverall: 52 }
  }

  let youth = 0
  let prime = 0
  let totalOverall = 0
  for (const p of roster) {
    if (p.age <= 23) youth++
    if (p.age >= 24 && p.age <= 29) prime++
    totalOverall += averageAttributes(p.attributes)
  }

  return {
    youthRatio: youth / roster.length,
    primeRatio: prime / roster.length,
    avgOverall: totalOverall / roster.length,
  }
}

function computeSignals(
  club: Club,
  players: Record<string, Player>,
  ladderPosition: number,
): Record<ClubIdentityType, number> {
  const roster = computeRosterProfile(players, club.id)
  const youthAcademy = club.facilities.youthAcademy
  const analysisSuite = club.facilities.analysisSuite

  const youthSignal = clamp(
    roster.youthRatio * 52 +
      youthAcademy * 8 +
      (club.aiPersonality.competitiveWindow === 'rebuilding' ? 13 : 0) +
      (club.aiPersonality.draftPhilosophy === 'high-upside' ? 10 : 0) +
      (ladderPosition >= 11 ? 7 : -4),
    15,
    95,
  )

  const starSignal = clamp(
    roster.primeRatio * 30 +
      roster.avgOverall * 0.72 +
      (club.aiPersonality.competitiveWindow === 'win-now' ? 11 : 0) +
      (club.tier === 'large' ? 9 : club.tier === 'medium' ? 5 : 1) +
      (ladderPosition <= 8 ? 6 : -5),
    15,
    95,
  )

  const defensiveSignal = clamp(
    (club.tacticalIdentity === 'defensive' ? 20 : 0) +
      (club.gameplan.offensiveStyle === 'defensive' ? 17 : 0) +
      (club.gameplan.defensiveLine === 'press' || club.gameplan.defensiveLine === 'zone' ? 9 : 0) +
      (club.aiPersonality.riskTolerance === 'conservative' ? 7 : 0) +
      analysisSuite * 6 +
      (ladderPosition <= 8 ? 6 : 0) +
      roster.avgOverall * 0.36,
    15,
    95,
  )

  return {
    'youth-development': youthSignal,
    'star-chasing': starSignal,
    'defensive-powerhouse': defensiveSignal,
  }
}

function pickPrimary(scores: Record<ClubIdentityType, number>): ClubIdentityType {
  let best: ClubIdentityType = 'youth-development'
  let bestScore = -Infinity
  for (const k of IDENTITY_KEYS) {
    if (scores[k] > bestScore) {
      bestScore = scores[k]
      best = k
    }
  }
  return best
}

function deriveFanExpectation(identity: ClubIdentityType, ladderPosition: number): ClubIdentity['fanExpectation'] {
  if (identity === 'star-chasing') return ladderPosition <= 6 ? 'contend' : 'finals'
  if (identity === 'defensive-powerhouse') return ladderPosition <= 8 ? 'finals' : 'progress'
  return ladderPosition <= 10 ? 'progress' : 'patience'
}

export function evolveClubIdentity(params: {
  club: Club
  players: Record<string, Player>
  ladderPosition: number
  rng: SeededRNG
  currentYear: number
}): { identity: ClubIdentity; changed: boolean } {
  const { club, players, ladderPosition, rng, currentYear } = params
  const previous = getClubIdentity(club, currentYear)
  const signals = computeSignals(club, players, ladderPosition)

  const scores = zeroIdentityScores()
  for (const k of IDENTITY_KEYS) {
    const smoothed = previous.scores[k] * 0.74 + signals[k] * 0.26 + rng.nextFloat(-2.2, 2.2)
    scores[k] = Math.round(clamp(smoothed, 0, 100) * 10) / 10
  }

  const current = pickPrimary(scores)
  const changed = current !== previous.current
  const oldLead = previous.scores[previous.current]
  const newLead = scores[current]
  const momentum = Math.round(clamp(previous.momentum * 0.45 + (newLead - oldLead) / 4, -20, 20) * 10) / 10

  return {
    changed,
    identity: {
      current,
      previous: changed ? previous.current : previous.previous,
      scores,
      momentum,
      fanExpectation: deriveFanExpectation(current, ladderPosition),
      lastEvolvedYear: currentYear,
    },
  }
}

export function getIdentityDraftModifiers(identity: ClubIdentityType): {
  youthPreference: number
  readyMadePreference: number
  defensiveRoleBias: number
  upsideBias: number
} {
  if (identity === 'youth-development') {
    return { youthPreference: 4.5, readyMadePreference: -1.5, defensiveRoleBias: 0.5, upsideBias: 4 }
  }
  if (identity === 'star-chasing') {
    return { youthPreference: -1.2, readyMadePreference: 4.8, defensiveRoleBias: 0.2, upsideBias: 1.4 }
  }
  return { youthPreference: 0.3, readyMadePreference: 1.5, defensiveRoleBias: 4.6, upsideBias: 1.2 }
}

export function getIdentityFreeAgencyModifiers(identity: ClubIdentityType): {
  youngTargetBias: number
  veteranTargetBias: number
  starAggression: number
} {
  if (identity === 'youth-development') {
    return { youngTargetBias: 0.15, veteranTargetBias: -0.18, starAggression: -0.04 }
  }
  if (identity === 'star-chasing') {
    return { youngTargetBias: -0.04, veteranTargetBias: 0.11, starAggression: 0.14 }
  }
  return { youngTargetBias: 0.02, veteranTargetBias: 0.03, starAggression: 0.02 }
}

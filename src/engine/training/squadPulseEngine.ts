/**
 * Squad Pulse Engine
 * -----------------
 * Generates a short weekly narrative note for each player that reflects their
 * readiness state after training.  Notes are stored on the player (rolling
 * window of 10) and the most recent note's `modifier` field nudges the match
 * availability multiplier in simulateMatch.ts.
 */

import type { Player, PlayerPulseNote, PulseTag } from '@/types/player'
import type { TrainingResult } from '@/engine/training/trainingEngine'
import type { SeededRNG } from '@/engine/core/rng'

// ── Messages ─────────────────────────────────────────────────────────────────

const PULSE_MESSAGES: Record<PulseTag, string[]> = {
  peaking: [
    'Everything is clicking — primed for a big one.',
    'Hit the track with real purpose this week.',
    'Body and mind are right — perfect timing before the game.',
    'Coaches are raving about his attitude at training.',
    'The preparation has been spot on. Best shape of the year.',
    'Flying in the drills. Hard to keep off the ball.',
  ],
  fresh: [
    'Looking sharp — legs feel great heading into the weekend.',
    'Bounced out of bed this morning, can\'t wait to play.',
    'Nice and fresh after a lighter week. Ready to go.',
    'Has had time to recover and it\'s showing in training.',
    'Energy levels are high. Good signs before the game.',
  ],
  confident: [
    'Oozing confidence after a standout performance last week.',
    'Strutting around training with a spring in his step.',
    'Wants the footy in his hands. Riding a real purple patch.',
    'Can\'t keep the smile off his face at the main session.',
    'The form has done wonders for his belief.',
    'Hard to keep off the ball — teammates feeding off his energy.',
  ],
  breakthrough: [
    'Something clicked in training this week — noticeable improvement.',
    'Put in the extra yards and it\'s paying dividends.',
    'Teammates have noticed the step up in his execution.',
    'The skill work has been exceptional. Coaches are pleased.',
    'Extra sessions off the schedule are bearing real fruit.',
    'A genuine improvement this week. Good things ahead.',
  ],
  overcooked: [
    'The body\'s copping it after a big training block. Needs a lighter run this week.',
    'Looked a bit flat — might be worth managing his load.',
    'Heavy legs after a gruelling week on the track.',
    'Coach has been running him hard. A rest day could go a long way.',
    'A few extra recovery hours wouldn\'t hurt before game day.',
    'Pulling up tired. The intensity has been high.',
  ],
  fatigued: [
    'Body language is a bit flat at the main session.',
    'Carrying fatigue from the big game last week.',
    'The big minutes are starting to catch up with him.',
    'Looking weary but still fronting up for the team.',
    'Heavy legs but hasn\'t missed a session. Attitude is right.',
    'Not quite firing on all cylinders. Fatigue is showing.',
  ],
  sore: [
    'Pulling up a bit stiff but should be right to train.',
    'Managing some soreness through the week.',
    'Strapped up and getting through sessions okay.',
    'Not 100% but putting his hand up. Tough as nails.',
    'A niggle he\'s managing carefully. Low risk to play.',
    'A bit tender through the week but pushing through.',
  ],
  struggling: [
    'Confidence seems a bit shaky at the moment. Needs a response.',
    'Not quite himself at training. Looking for a form lift.',
    'Going through a tough patch. Needs some footy.',
    'The body is willing but the mind isn\'t quite there.',
    'Struggling to replicate his best footy this week.',
    'Has been searching for answers at training.',
  ],
  returning: [
    'Easing back into the program — medical team happy with progress.',
    'Good to see him back on the track, albeit cautiously.',
    'Looked a bit rusty but the intensity is slowly returning.',
    'Building his way back after a stint on the sidelines.',
    'Getting through some light work. Aiming to be available.',
    'Back to training with a smile. Managed carefully for now.',
  ],
  undertrained: [
    'Hasn\'t been tested enough this week — might struggle for intensity.',
    'Light week on the track. Will need to find his groove quickly.',
    'Training load has been minimal. A risk come game day.',
    'Needs to find some intensity before the final session.',
    'Not much load through the week. Could go either way.',
  ],
}

// ── Modifiers ─────────────────────────────────────────────────────────────────

const PULSE_MODIFIERS: Record<PulseTag, number> = {
  peaking:      0.04,
  fresh:        0.02,
  confident:    0.03,
  breakthrough: 0.02,
  overcooked:  -0.04,
  fatigued:    -0.03,
  sore:        -0.02,
  struggling:  -0.02,
  returning:   -0.03,
  undertrained:-0.01,
}

// ── Tag metadata for the UI ───────────────────────────────────────────────────

export interface PulseTagMeta {
  label: string
  dotClass: string
  bgClass: string
  textClass: string
  borderClass: string
  sentiment: 'positive' | 'neutral' | 'negative'
}

export const PULSE_TAG_META: Record<PulseTag, PulseTagMeta> = {
  peaking:      { label: 'Peaking',       dotClass: 'bg-emerald-500', bgClass: 'bg-emerald-500/15', textClass: 'text-emerald-600 dark:text-emerald-400', borderClass: 'border-emerald-500/30', sentiment: 'positive' },
  fresh:        { label: 'Fresh',         dotClass: 'bg-green-500',   bgClass: 'bg-green-500/10',   textClass: 'text-green-600 dark:text-green-400',     borderClass: 'border-green-500/25',   sentiment: 'positive' },
  confident:    { label: 'Confident',     dotClass: 'bg-sky-500',     bgClass: 'bg-sky-500/10',     textClass: 'text-sky-600 dark:text-sky-400',         borderClass: 'border-sky-500/25',     sentiment: 'positive' },
  breakthrough: { label: 'Breakthrough',  dotClass: 'bg-violet-500',  bgClass: 'bg-violet-500/10',  textClass: 'text-violet-600 dark:text-violet-400',   borderClass: 'border-violet-500/25',  sentiment: 'positive' },
  sore:         { label: 'Sore',          dotClass: 'bg-amber-500',   bgClass: 'bg-amber-500/10',   textClass: 'text-amber-600 dark:text-amber-400',     borderClass: 'border-amber-500/25',   sentiment: 'neutral' },
  returning:    { label: 'Returning',     dotClass: 'bg-amber-400',   bgClass: 'bg-amber-400/10',   textClass: 'text-amber-600 dark:text-amber-400',     borderClass: 'border-amber-400/25',   sentiment: 'neutral' },
  undertrained: { label: 'Undertrained',  dotClass: 'bg-amber-600',   bgClass: 'bg-amber-600/10',   textClass: 'text-amber-700 dark:text-amber-500',     borderClass: 'border-amber-600/25',   sentiment: 'neutral' },
  fatigued:     { label: 'Fatigued',      dotClass: 'bg-orange-500',  bgClass: 'bg-orange-500/10',  textClass: 'text-orange-600 dark:text-orange-400',   borderClass: 'border-orange-500/25',  sentiment: 'negative' },
  overcooked:   { label: 'Overcooked',    dotClass: 'bg-red-500',     bgClass: 'bg-red-500/10',     textClass: 'text-red-600 dark:text-red-400',         borderClass: 'border-red-500/25',     sentiment: 'negative' },
  struggling:   { label: 'Struggling',    dotClass: 'bg-rose-400',    bgClass: 'bg-rose-400/10',    textClass: 'text-rose-500 dark:text-rose-400',       borderClass: 'border-rose-400/25',    sentiment: 'negative' },
}

// ── Tag determination logic ───────────────────────────────────────────────────

function weeksBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to + 'T00:00:00')
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 7))
}

function determinePulseTag(
  player: Player,
  result: TrainingResult | undefined,
  currentDate: string,
): PulseTag {
  const { fatigue, fitness, form } = player

  // 1. Returning from injury — highest priority
  if (!player.injury) {
    const hist = player.injuryHistory ?? []
    const latest = hist.length > 0 ? hist[hist.length - 1] : null
    if (latest?.recoveredOn && weeksBetween(latest.recoveredOn, currentDate) <= 2) {
      return 'returning'
    }
  }

  // 2. Breakthrough — significant attribute gain this week
  if (result) {
    const totalGain = Object.values(result.attributeChanges).reduce<number>(
      (sum, v) => sum + Math.max(0, v ?? 0),
      0,
    )
    if (totalGain >= 0.75) return 'breakthrough'
  }

  // 3. Overcooked — heavy training pushed fatigue very high
  if (fatigue >= 72 && (result?.fatigueChange ?? 0) > 4) return 'overcooked'

  // 4. Fatigued — generally high fatigue
  if (fatigue >= 66) return 'fatigued'

  // 5. Peaking — optimal state
  if (fatigue <= 30 && fitness >= 78 && form >= 62) return 'peaking'

  // 6. Fresh — well recovered
  if (fatigue <= 30 && fitness >= 55) return 'fresh'

  // 7. Confident — riding form or had a strong recent game
  const lastRating = player.matchRatingHistory?.length
    ? player.matchRatingHistory[player.matchRatingHistory.length - 1]
    : null
  if (form >= 72 || (lastRating !== null && lastRating >= 22 && (player.seasonStats?.gamesPlayed ?? 0) >= 2)) {
    return 'confident'
  }

  // 8. Struggling — poor form or bad recent game
  if (form < 28 || (lastRating !== null && lastRating < 10 && (player.seasonStats?.gamesPlayed ?? 0) >= 2)) {
    return 'struggling'
  }

  // 9. Sore — moderate fatigue band
  if (fatigue >= 45) return 'sore'

  // 10. Undertrained — very low load AND below-par fitness
  if (fatigue <= 18 && fitness < 52 && (!result || (result.fatigueChange <= 0))) {
    return 'undertrained'
  }

  // Default — low fatigue, average shape
  return fatigue < 35 ? 'fresh' : 'sore'
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface PlayerPulseEntry {
  playerId: string
  note: PlayerPulseNote
}

/**
 * Generate one pulse note per player based on their post-training state.
 * Pass `trainingResults` as `[]` when no training was scheduled — players will
 * still get a state-based note.
 */
export function generateSquadPulseNotes(
  players: Player[],
  trainingResults: TrainingResult[],
  rng: SeededRNG,
  round: number,
  date: string,
): PlayerPulseEntry[] {
  const resultMap = new Map<string, TrainingResult>(
    trainingResults.map((r) => [r.playerId, r]),
  )

  return players.map((player) => {
    const result = resultMap.get(player.id)
    const tag = determinePulseTag(player, result, date)
    const messages = PULSE_MESSAGES[tag]
    const message = messages[Math.floor(rng.next() * messages.length)]
    const modifier = PULSE_MODIFIERS[tag]

    const note: PlayerPulseNote = { round, date, tag, message, modifier }
    return { playerId: player.id, note }
  })
}

/** Returns the player's most recent pulse note, or null if none yet. */
export function getCurrentPulse(player: Player): PlayerPulseNote | null {
  const notes = player.pulseNotes
  if (!notes?.length) return null
  return notes[notes.length - 1]
}

export type SelectionAdvice = 'start' | 'monitor' | 'rest'

export interface PulseSelectionAdvice {
  advice: SelectionAdvice | null
  reason: string
}

/**
 * Returns a plain-English selection suggestion based on the player's pulse.
 * Used by the lineup page and squad pulse UI.
 */
export function getPulseSelectionAdvice(player: Player): PulseSelectionAdvice {
  const note = getCurrentPulse(player)
  if (!note) return { advice: null, reason: '' }

  switch (note.tag) {
    case 'peaking':
    case 'confident':
      return { advice: 'start', reason: note.message }
    case 'fresh':
    case 'breakthrough':
      return { advice: 'start', reason: note.message }
    case 'overcooked':
    case 'fatigued':
      return { advice: 'rest', reason: note.message }
    case 'sore':
    case 'returning':
      return { advice: 'monitor', reason: note.message }
    case 'struggling':
      return { advice: 'monitor', reason: note.message }
    case 'undertrained':
      return { advice: 'monitor', reason: note.message }
    default:
      return { advice: null, reason: '' }
  }
}

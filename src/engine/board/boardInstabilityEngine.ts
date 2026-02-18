import type { SeededRNG } from '@/engine/core/rng'
import type { NewsItem } from '@/types/game'
import type {
  SpillEvent,
  SpillEventType,
  SpillOutcome,
  BoardInstabilityState,
} from '@/types/boardApproval'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpillResolution {
  outcome: SpillOutcome
  jobSecurityDelta: number
  newExpectation: string | null
  newCompetitiveWindow: 'win-now' | 'balanced' | 'rebuilding' | null
  newChairmanSupportLevel: number | null
  resolvedEvent: SpillEvent
  newsItems: NewsItem[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum rounds between spill events (prevents spam). */
const MIN_ROUNDS_BETWEEN_SPILLS = 5

/** Earliest round a spill can occur (give the season a chance to develop). */
const EARLIEST_SPILL_ROUND = 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function generateId(rng: SeededRNG): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'spill_'
  for (let i = 0; i < 10; i++) id += chars[rng.nextInt(0, chars.length - 1)]
  return id
}

function buildNews(
  id: string,
  date: string,
  headline: string,
  body: string,
  clubIds: string[],
): NewsItem {
  return { id, date, headline, body, category: 'general', clubIds, playerIds: [] }
}

// ---------------------------------------------------------------------------
// 1. Instability Score
// ---------------------------------------------------------------------------

/**
 * Compute a 0–100 board instability score for the player's club.
 * Higher = greater risk of triggering a spill event this round.
 */
export function computeInstabilityScore(params: {
  jobSecurity: number
  consecutiveLosses: number
  fanSatisfaction: number
  ladderPosition: number
  teamCount: number
  financeBalance: number
  salaryCap: number
  mediaPressureScore: number
  chairmanSupportLevel: number
}): number {
  const {
    jobSecurity,
    consecutiveLosses,
    fanSatisfaction,
    ladderPosition,
    teamCount,
    financeBalance,
    salaryCap,
    mediaPressureScore,
    chairmanSupportLevel,
  } = params

  let score = 0

  // --- Job security factor (low security = high instability) ---
  // jobSecurity 50 → +0, 30 → +10, 10 → +20, 0 → +25
  score += Math.max(0, (50 - jobSecurity) * 0.5)

  // --- Consecutive losses (builds pressure quickly) ---
  score += Math.min(30, consecutiveLosses * 8)

  // --- Fan dissatisfaction ---
  if (fanSatisfaction < 20) score += 16
  else if (fanSatisfaction < 35) score += 10
  else if (fanSatisfaction < 50) score += 5

  // --- Financial stress ---
  if (financeBalance < 0) score += 12
  else if (financeBalance < salaryCap * 0.05) score += 5

  // --- Media pressure ---
  if (mediaPressureScore > 70) score += 12
  else if (mediaPressureScore > 50) score += 7
  else if (mediaPressureScore > 35) score += 3

  // --- Chairman antipathy (skeptical chairman amplifies; supportive dampens) ---
  if (chairmanSupportLevel < 25) score += 12
  else if (chairmanSupportLevel < 40) score += 6
  else if (chairmanSupportLevel > 70) score -= 6
  else if (chairmanSupportLevel > 55) score -= 3

  // --- Ladder position (bottom-half clubs attract more board scrutiny) ---
  const relPos = (ladderPosition - 1) / Math.max(1, teamCount - 1) // 0 (top) to 1 (bottom)
  score += Math.round(relPos * 10)

  return clamp(Math.round(score), 0, 100)
}

// ---------------------------------------------------------------------------
// 2. Trigger logic
// ---------------------------------------------------------------------------

/**
 * Return true if conditions are met to attempt a spill roll this round.
 * Enforces cooldown and minimum score threshold.
 */
export function shouldCheckForSpill(
  state: BoardInstabilityState,
  currentRound: number,
  boardPoliticsEnabled: boolean,
): boolean {
  if (!boardPoliticsEnabled) return false
  if (currentRound < EARLIEST_SPILL_ROUND) return false
  if (currentRound - state.lastSpillRound < MIN_ROUNDS_BETWEEN_SPILLS) return false
  if (state.score < 40) return false
  return true
}

/**
 * Roll whether a spill event actually fires this round.
 * Probability scales with instability score.
 */
export function rollForSpillEvent(instabilityScore: number, rng: SeededRNG): boolean {
  let chance = 0
  if (instabilityScore >= 85) chance = 0.22
  else if (instabilityScore >= 70) chance = 0.15
  else if (instabilityScore >= 55) chance = 0.08
  else if (instabilityScore >= 40) chance = 0.04
  return rng.chance(chance)
}

// ---------------------------------------------------------------------------
// 3. Event generation
// ---------------------------------------------------------------------------

function selectEventType(instabilityScore: number, rng: SeededRNG): SpillEventType {
  if (instabilityScore >= 85) {
    // 65% chairman-change, 35% emergency-meeting
    return rng.chance(0.65) ? 'chairman-change' : 'emergency-meeting'
  }
  if (instabilityScore >= 70) return 'emergency-meeting'
  if (instabilityScore >= 55) return 'vote-of-confidence'
  return 'board-challenge'
}

const CHALLENGE_HEADLINES = [
  'Board faction questions {{manager}} future at {{club}}',
  '{{club}} board members divided over management strategy',
  'Growing unease in {{club}} boardroom over recent results',
  'Sources: Board members raising concerns about {{club}} direction',
]

const VOC_HEADLINES = [
  '{{club}} board to hold formal vote of confidence in {{manager}}',
  'Board of directors to review {{manager}} position at {{club}}',
  '{{club}} chairman calls emergency vote on coaching staff',
  'Vote of confidence called after {{club}} board unrest',
]

const EMERGENCY_HEADLINES = [
  '{{club}} board holds emergency crisis session',
  'Board convenes special meeting amid {{club}} struggles',
  '{{club}} directors call emergency review of club direction',
  'Crisis talks at {{club}} as board intervenes',
]

const CHAIRMAN_HEADLINES = [
  '{{club}} announces new board chairman',
  'Leadership shakeup: {{club}} installs new chairman',
  '{{club}} chairman steps down; new leadership to take control',
  'Board transition at {{club}} as chairman steps aside',
]

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? k)
}

/**
 * Generate a SpillEvent. The event is created resolved=false;
 * call resolveSpillEvent separately to get outcome + effects.
 */
export function generateSpillEvent(params: {
  instabilityScore: number
  jobSecurity: number
  consecutiveLosses: number
  currentRound: number
  currentYear: number
  currentDate: string
  clubName: string
  managerName: string
  rng: SeededRNG
}): SpillEvent {
  const {
    instabilityScore,
    currentRound,
    currentYear,
    currentDate,
    clubName,
    managerName,
    rng,
  } = params

  const type = selectEventType(instabilityScore, rng)
  const vars = { club: clubName, manager: managerName }

  let headlinePool: string[]
  let description: string

  switch (type) {
    case 'board-challenge':
      headlinePool = CHALLENGE_HEADLINES
      description =
        `A faction within the ${clubName} board has raised concerns about the club's ` +
        `recent results and overall direction. The group has reportedly sought a formal ` +
        `meeting with the chairman to discuss ${managerName}'s future at the club.`
      break
    case 'vote-of-confidence':
      headlinePool = VOC_HEADLINES
      description =
        `The ${clubName} board has called a formal vote of confidence in ${managerName}. ` +
        `The vote, triggered by the club's recent slide in form and growing supporter ` +
        `discontent, will determine whether the coach retains the full backing of the ` +
        `board going forward.`
      break
    case 'emergency-meeting':
      headlinePool = EMERGENCY_HEADLINES
      description =
        `The ${clubName} board has convened an emergency meeting to address the club's ` +
        `current situation. Senior board members have described the meeting as "essential" ` +
        `given the deteriorating on-field results and heightened scrutiny from supporters ` +
        `and media. Strategic and personnel decisions are on the agenda.`
      break
    case 'chairman-change':
      headlinePool = CHAIRMAN_HEADLINES
      description =
        `In a significant board development, ${clubName} will install a new chairman. ` +
        `The departing chairman cited "the right time for fresh leadership" as the reason ` +
        `for the change. The new chairman is expected to outline a revised strategic vision ` +
        `and board expectations in the coming days.`
      break
  }

  const headline = fillTemplate(rng.pick(headlinePool), vars)

  return {
    id: generateId(rng),
    type,
    triggeredRound: currentRound,
    triggeredYear: currentYear,
    triggeredDate: currentDate,
    instabilityScore,
    headline,
    description,
    resolved: false,
    jobSecurityDelta: 0,
  }
}

// ---------------------------------------------------------------------------
// 4. Resolution
// ---------------------------------------------------------------------------

const EXPECTATION_STRINGS = {
  demanding: [
    'The board demands a finals appearance this season.',
    'Board expectations are clear: top-8 or face significant consequences.',
    'The new regime will not accept anything short of finals football.',
    'With the honeymoon period over, only results will satisfy the board.',
  ],
  lenient: [
    'The board has adopted a more patient stance, prioritising development.',
    'New expectations focus on culture-building and squad improvement.',
    'The board will assess progress over the medium term, not round by round.',
    'Expectations have been recalibrated: growth and stability are the primary goals.',
  ],
  maintaining: [
    'The board reaffirmed existing targets and expectations remain unchanged.',
    'Club strategy continues on its current trajectory per board direction.',
  ],
}

/**
 * Resolve a spill event and compute all downstream effects.
 */
export function resolveSpillEvent(params: {
  event: SpillEvent
  jobSecurity: number
  chairmanSupportLevel: number
  currentDate: string
  clubId: string
  clubName: string
  managerName: string
  rng: SeededRNG
}): SpillResolution {
  const { event, jobSecurity, chairmanSupportLevel: _chairmanSupportLevel, currentDate, clubId, clubName, managerName, rng } = params

  let outcome: SpillOutcome
  let jobSecurityDelta = 0
  let newExpectation: string | null = null
  let newCompetitiveWindow: 'win-now' | 'balanced' | 'rebuilding' | null = null
  let newChairmanSupportLevel: number | null = null
  const newsItems: NewsItem[] = []

  switch (event.type) {
    case 'board-challenge': {
      // Outcome depends on job security
      if (jobSecurity > 55) {
        outcome = 'survived'
        jobSecurityDelta = rng.nextInt(-10, -4)
        const resolveHeadline = `${managerName} retains board backing despite internal challenge`
        const resolveBody =
          `${managerName} has survived the board challenge at ${clubName}, ` +
          `with the chairman reaffirming support for the coaching staff. ` +
          `However, the challenge has left its mark — the board has made clear ` +
          `that improved results are expected in coming weeks.`
        newsItems.push(buildNews(crypto.randomUUID(), currentDate, resolveHeadline, resolveBody, [clubId]))
      } else {
        outcome = 'on-notice'
        jobSecurityDelta = rng.nextInt(-16, -9)
        if (rng.chance(0.3)) {
          newExpectation = rng.pick(EXPECTATION_STRINGS.demanding)
        }
        const resolveHeadline = `${managerName} placed on notice following board challenge at ${clubName}`
        const resolveBody =
          `Following internal pressure, the ${clubName} board has placed ${managerName} on formal notice. ` +
          `While the coach retains their role, the board has set explicit expectations ` +
          `and will be closely monitoring results over the coming rounds.` +
          (newExpectation ? ` ${newExpectation}` : '')
        newsItems.push(buildNews(crypto.randomUUID(), currentDate, resolveHeadline, resolveBody, [clubId]))
      }
      break
    }

    case 'vote-of-confidence': {
      if (jobSecurity > 60) {
        outcome = 'survived'
        // Strong position: survives comfortably, minor hit or even slight boost
        jobSecurityDelta = rng.nextInt(-5, 3)
        if (rng.chance(0.25)) {
          newExpectation = rng.pick(EXPECTATION_STRINGS.demanding)
        }
        const resolveHeadline = `${managerName} wins ${clubName} board confidence vote`
        const resolveBody =
          `${managerName} has comfortably survived the board's vote of confidence at ${clubName}. ` +
          `The vote passed with strong support, and the board issued a statement ` +
          `reaffirming their commitment to the coaching staff and club direction. ` +
          `${managerName} described the result as "a relief but also a challenge to ` +
          `deliver on our ambitions."`
        newsItems.push(buildNews(crypto.randomUUID(), currentDate, resolveHeadline, resolveBody, [clubId]))
      } else if (jobSecurity > 40) {
        outcome = 'on-notice'
        jobSecurityDelta = rng.nextInt(-16, -9)
        newExpectation = rng.pick(EXPECTATION_STRINGS.demanding)
        const resolveHeadline = `${managerName} narrowly survives confidence vote at ${clubName}`
        const resolveBody =
          `${managerName} has survived the ${clubName} board's confidence vote, but only narrowly. ` +
          `Key board members voted against the motion, and those who supported ${managerName} ` +
          `attached conditions, including a formal expectation review. ` +
          `The coach acknowledged the result and vowed to address the club's form issues.`
        newsItems.push(buildNews(crypto.randomUUID(), currentDate, resolveHeadline, resolveBody, [clubId]))
      } else {
        // Very low job security — barely survives or gets dismissed
        if (jobSecurity < 28 && rng.chance(0.15)) {
          outcome = 'dismissed'
          jobSecurityDelta = -jobSecurity // drain to 0
          const resolveHeadline = `${clubName} board votes to dismiss ${managerName}`
          const resolveBody =
            `In a dramatic turn, the ${clubName} board has voted to dismiss ${managerName} ` +
            `following the confidence vote. The decision ends a difficult tenure. ` +
            `The club will begin the search for a replacement immediately.`
          newsItems.push(buildNews(crypto.randomUUID(), currentDate, resolveHeadline, resolveBody, [clubId]))
        } else {
          outcome = 'on-notice'
          jobSecurityDelta = rng.nextInt(-22, -14)
          newExpectation = rng.pick(EXPECTATION_STRINGS.demanding)
          const resolveHeadline = `${managerName} on thin ice after barely surviving confidence vote`
          const resolveBody =
            `${managerName} survived the ${clubName} confidence vote by the slimmest of margins. ` +
            `Multiple board members voted against the motion, and the outcome has been described ` +
            `as a "stay of execution." ${managerName} must deliver immediate improvement ` +
            `or face renewed board action.`
          newsItems.push(buildNews(crypto.randomUUID(), currentDate, resolveHeadline, resolveBody, [clubId]))
        }
      }
      break
    }

    case 'emergency-meeting': {
      // Always impactful — job security drops, expectations reset
      outcome = 'on-notice'
      jobSecurityDelta = rng.nextInt(-22, -10)
      // Expectations shift toward more lenient (board resets to stabilise)
      newExpectation = rng.pick(EXPECTATION_STRINGS.lenient)
      const resolveHeadline = `${clubName} board crisis meeting concludes with ${managerName} under review`
      const resolveBody =
        `Following hours of deliberation, the ${clubName} board's emergency meeting has concluded. ` +
        `${managerName} retains the role for now but is under formal performance review. ` +
        `The board announced an immediate reset of club strategy and expectations, ` +
        `emphasising development and stability over short-term results. ` +
        `${managerName} will be assessed on a match-by-match basis going forward.`
      newsItems.push(buildNews(crypto.randomUUID(), currentDate, resolveHeadline, resolveBody, [clubId]))
      break
    }

    case 'chairman-change': {
      outcome = 'chairman-replaced'
      // New chairman's support level: 25–75
      const newSupport = rng.nextInt(25, 75)
      newChairmanSupportLevel = newSupport

      // New chairman effect on job security
      if (newSupport > 60) {
        // Supportive new chairman — fresh start, mild boost
        jobSecurityDelta = rng.nextInt(4, 14)
        newExpectation = rng.pick(
          newSupport > 70
            ? EXPECTATION_STRINGS.lenient
            : EXPECTATION_STRINGS.maintaining,
        )
      } else if (newSupport < 40) {
        // Skeptical new chairman — immediately applies pressure
        jobSecurityDelta = rng.nextInt(-16, -6)
        newExpectation = rng.pick(EXPECTATION_STRINGS.demanding)
      } else {
        // Neutral new chairman — small impact
        jobSecurityDelta = rng.nextInt(-5, 5)
        newExpectation = rng.pick(EXPECTATION_STRINGS.maintaining)
      }

      // 30% chance competitive window shifts
      if (rng.chance(0.30)) {
        if (newSupport > 55) {
          // Supportive + high instability → often pushes to "win-now"
          newCompetitiveWindow = rng.chance(0.6) ? 'win-now' : 'balanced'
        } else {
          // Skeptical/neutral → may push to rebuild
          newCompetitiveWindow = rng.chance(0.55) ? 'rebuilding' : 'balanced'
        }
      }

      const supportDesc = newSupport > 60 ? 'a stated desire to support the current coaching setup'
        : newSupport < 40 ? 'a mandate for immediate on-field improvement'
        : 'a patient, long-term vision for the club'

      const resolveHeadline = `New era begins at ${clubName} as incoming chairman outlines direction`
      const resolveBody =
        `${clubName}'s new chairman has formally taken control of the board, bringing ` +
        `${supportDesc}. ` +
        (newExpectation ? `The incoming chairman stated: "${newExpectation}" ` : '') +
        (newCompetitiveWindow
          ? `The club's strategic direction has been revised toward a "${newCompetitiveWindow}" approach. `
          : '') +
        `${managerName} met with the new chairman and described the meeting as "constructive."`
      newsItems.push(buildNews(crypto.randomUUID(), currentDate, resolveHeadline, resolveBody, [clubId]))
      break
    }
  }

  // Add the triggering event as initial news
  newsItems.unshift(buildNews(
    crypto.randomUUID(),
    currentDate,
    event.headline,
    event.description,
    [clubId],
  ))

  const resolvedEvent: SpillEvent = {
    ...event,
    resolved: true,
    resolvedDate: currentDate,
    outcome,
    jobSecurityDelta,
    newExpectation: newExpectation ?? undefined,
    newCompetitiveWindow: newCompetitiveWindow ?? undefined,
  }

  return {
    outcome,
    jobSecurityDelta,
    newExpectation,
    newCompetitiveWindow,
    newChairmanSupportLevel,
    resolvedEvent,
    newsItems,
  }
}

// ---------------------------------------------------------------------------
// 5. Utilities
// ---------------------------------------------------------------------------

/**
 * Update consecutive loss counter based on latest match result.
 * Returns 0 on win/draw, increments on loss.
 */
export function updateConsecutiveLosses(current: number, wonOrDraw: boolean): number {
  return wonOrDraw ? 0 : current + 1
}

/** Create the default (zero-pressure) board instability state. */
export function createInitialBoardInstabilityState(): BoardInstabilityState {
  return {
    score: 0,
    consecutiveLosses: 0,
    spillHistory: [],
    lastSpillRound: -1,
    chairmanSupportLevel: 50,
  }
}

/** Reset season-specific instability (keep chairman support and history). */
export function resetSeasonInstability(
  current: BoardInstabilityState,
): BoardInstabilityState {
  return {
    ...current,
    score: 0,
    consecutiveLosses: 0,
    lastSpillRound: -1,
  }
}

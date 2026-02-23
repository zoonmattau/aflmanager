/**
 * Captaincy Change Engine
 *
 * Processes the removal or reassignment of a captain (or vice-captain) and
 * generates the downstream event flow:
 *   1. A private player-reaction message shown only to the coach
 *   2. A squad-wide leadership-response modifier (morale delta for every other player)
 *   3. An optional press/media narrative affecting board pressure and fan sentiment
 */

import type { Player } from '@/types/player'
import type { Club } from '@/types/club'
import type { SeededRNG } from '@/engine/core/rng'
import { getLeadershipScore } from '@/engine/leadership/leadershipEngine'

// ── Public types ──────────────────────────────────────────────────────────────

export type CaptaincyReactionType =
  | 'loyal-acceptance'   // Accepts gracefully — morale dips but commitment stays
  | 'motivation-spike'   // Uses it as fuel — "chip on shoulder" response
  | 'quiet-resentment'   // Privately hurt; potential future trade risk
  | 'trade-request'      // Formally requests a trade
  | 'public-criticism'   // Speaks publicly; board/fan pressure follows

export interface CaptaincyReaction {
  type: CaptaincyReactionType
  /** Morale change for the stripped player (negative). */
  moraleDelta: number
  /** Whether to immediately set player.tradeRequest. */
  tradeRequestTriggered: boolean
  /** Single-paragraph private message shown to the coach in the inbox. */
  privateMessage: string
}

export interface SquadResponseModifier {
  label: 'positive' | 'neutral' | 'negative'
  /** Morale change applied to every other player in the club (capped ±3). */
  moraleDelta: number
  /** One-sentence description surfaced in the private coaching message. */
  description: string
}

export interface CaptaincyMediaNarrative {
  headline: string
  body: string
  tone: 'straight' | 'rumour' | 'controversy' | 'analysis'
  /** Added to boardInstability.score (positive = more pressure). */
  boardInstabilityDelta: number
  /** Added to club.fanSatisfaction (negative = fan concern). */
  fanSatisfactionDelta: number
}

export interface CaptaincyChangeResult {
  strippedPlayerId: string
  newCaptainId: string | null
  role: 'captain' | 'vice-captain'
  reaction: CaptaincyReaction
  squadResponse: SquadResponseModifier
  mediaNarrative?: CaptaincyMediaNarrative
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Perceived fairness of the change: positive = good swap, negative = questionable. */
function calcFairnessScore(
  stripped: Player,
  newCaptainId: string | null,
  players: Record<string, Player>,
): number {
  const strippedScore = getLeadershipScore(stripped)
  if (!newCaptainId) return -10 // no replacement = unfair by default
  const newPlayer = players[newCaptainId]
  if (!newPlayer) return -5
  return getLeadershipScore(newPlayer) - strippedScore
}

// ── Reaction selection ────────────────────────────────────────────────────────

function selectReactionType(
  stripped: Player,
  fairnessScore: number,
  rng: SeededRNG,
): CaptaincyReactionType {
  const { loyalty, temperament, ambition } = stripped.personality
  const archetype = stripped.agentArchetype
  const morale = stripped.morale
  const isFair = fairnessScore >= 8
  const isUnfair = fairnessScore < -6

  // Archetype overrides first
  if (archetype === 'loyal') {
    return morale < 40 ? 'quiet-resentment' : 'loyal-acceptance'
  }
  if (archetype === 'mercenary' || archetype === 'premiership-chaser') {
    if (isUnfair || morale < 45) return 'trade-request'
    return 'quiet-resentment'
  }

  // High loyalty path
  if (loyalty >= 72) {
    if (morale < 38) return 'quiet-resentment'
    if (isFair || morale >= 62) return 'loyal-acceptance'
    // Moderately unfair but loyal — might show motivation
    return rng.chance(0.55) ? 'motivation-spike' : 'loyal-acceptance'
  }

  // High ambition path
  if (ambition >= 75) {
    if (isUnfair && morale < 50) return 'trade-request'
    if (isUnfair) return rng.chance(0.4) ? 'trade-request' : 'quiet-resentment'
    return rng.chance(0.45) ? 'motivation-spike' : 'quiet-resentment'
  }

  // Low temperament path (volatile)
  if (temperament < 35) {
    if (isUnfair || morale < 45) {
      return rng.chance(0.5) ? 'public-criticism' : 'quiet-resentment'
    }
    return 'quiet-resentment'
  }

  // Middle ground
  if (morale < 40 && isUnfair) return 'trade-request'
  if (morale < 48 && isUnfair) return 'quiet-resentment'
  if (isFair) return rng.chance(0.6) ? 'loyal-acceptance' : 'motivation-spike'
  if (morale >= 65 && loyalty >= 55) return 'motivation-spike'
  return 'quiet-resentment'
}

// ── Morale deltas ─────────────────────────────────────────────────────────────

function moraleDeltaForReaction(type: CaptaincyReactionType, rng: SeededRNG): number {
  switch (type) {
    case 'loyal-acceptance':  return -(rng.nextInt(3, 6))
    case 'motivation-spike':  return -(rng.nextInt(2, 4))
    case 'quiet-resentment':  return -(rng.nextInt(8, 13))
    case 'trade-request':     return -(rng.nextInt(12, 18))
    case 'public-criticism':  return -(rng.nextInt(8, 12))
  }
}

// ── Private message templates ─────────────────────────────────────────────────

function buildPrivateMessage(
  type: CaptaincyReactionType,
  stripped: Player,
  newCaptain: Player | null,
  squadResponse: SquadResponseModifier,
  fairnessScore: number,
  rng: SeededRNG,
): string {
  const sn = `${stripped.firstName} ${stripped.lastName}`
  const ncn = newCaptain ? `${newCaptain.firstName} ${newCaptain.lastName}` : 'the new captain'
  const squadNote = `The squad's reaction has been ${squadResponse.label}: ${squadResponse.description.toLowerCase()}`

  const pools: Record<CaptaincyReactionType, string[]> = {
    'loyal-acceptance': [
      `${sn} met with the coaching staff and accepted the decision without complaint. "Whatever the club needs from me," he said privately. His leadership group status remains and his commitment to the cause is unquestioned. ${squadNote}.`,
      `Despite the change, ${sn} told staff he intends to lead by example from the field. Sources within the club describe the conversation as mature and forward-looking. ${squadNote}.`,
      `${sn} was briefed on the captaincy transition and responded with characteristic professionalism. He expressed support for ${ncn} and indicated he would help integrate the new leadership structure. ${squadNote}.`,
    ],
    'motivation-spike': [
      `${sn} told coaching staff he plans to use the captaincy change as motivation. "I'll let my footy do the talking," he reportedly said. Sources within the playing group believe he may be galvanised rather than deflated by the decision. ${squadNote}.`,
      `In a private meeting, ${sn} acknowledged hurt feelings but channelled them into determination. He is reportedly training with extra intensity and has privately stated he intends to earn the armband back. ${squadNote}.`,
      `${sn}'s reaction surprised staff — instead of resentment, he appears driven by the change. His body language in training has been noticeably more purposeful since the announcement. ${squadNote}.`,
    ],
    'quiet-resentment': [
      `${sn} was visibly disappointed when informed of the decision and sources close to the player indicate he is quietly questioning whether his future remains at the club. The situation warrants monitoring. ${squadNote}.`,
      `In a brief and tense meeting, ${sn} accepted the news professionally but said little. His management has since made contact with club officials — the full extent of his grievance remains unclear. ${squadNote}.`,
      `${sn} has not spoken publicly but is understood to be deeply unhappy with the process. Close teammates report a noticeable shift in his mood since the decision was made. If his situation doesn't improve, there may be trade period ramifications. ${squadNote}.`,
    ],
    'trade-request': [
      `${sn}'s management has formally contacted the club to discuss his future following the captaincy removal. He is seeking a trade and has nominated preferred destinations. The club faces a difficult window to manage this situation. ${squadNote}.`,
      `${sn} has requested a trade. In a meeting with football department staff, he cited loss of confidence in the club's direction as the primary reason. His commitment to fulfilling contractual obligations is not in doubt, but the request appears genuine. ${squadNote}.`,
      `Sources confirm ${sn} has formally requested a trade after being stripped of the captaincy. His management described the decision as "the final straw" following ongoing concerns about his standing at the club. ${squadNote}.`,
    ],
    'public-criticism': [
      `${sn} spoke to media after training and made clear his displeasure with the way the captaincy change was handled. His comments have created a public relations challenge for the club and will likely intensify scrutiny of football department decisions. ${squadNote}.`,
      `In an uncharacteristic move, ${sn} publicly questioned the club's leadership process, suggesting the timing and lack of communication were handled poorly. The comments have added unwanted pressure to the coaching staff ahead of the new season. ${squadNote}.`,
      `${sn} broke his silence in a post-training media appearance, implying the captaincy decision lacked proper process. The fallout has unsettled parts of the playing group and drawn attention from board level. ${squadNote}.`,
    ],
  }

  const msgs = pools[type]
  return rng.pick(msgs)
}

// ── Squad response ────────────────────────────────────────────────────────────

function buildSquadResponse(
  stripped: Player,
  newCaptainId: string | null,
  players: Record<string, Player>,
  fairnessScore: number,
  reactionType: CaptaincyReactionType,
  rng: SeededRNG,
): SquadResponseModifier {
  const popularity = stripped.attributes.teamPlayer / 100  // 0-1

  let baseDelta = 0
  let label: SquadResponseModifier['label'] = 'neutral'
  let description = ''

  if (fairnessScore >= 10) {
    // Clearly better captain replacing them
    baseDelta = rng.nextInt(1, 3)
    label = 'positive'
    description = 'the squad has broadly welcomed the leadership transition'
  } else if (fairnessScore >= -4) {
    // Broadly reasonable change
    baseDelta = rng.nextInt(0, 1)
    label = 'neutral'
    description = 'the squad has accepted the change without significant disruption'
  } else if (fairnessScore >= -12) {
    // Questionable move
    baseDelta = -(rng.nextInt(1, 2))
    label = 'negative'
    description = 'some players are privately questioning the decision'
  } else {
    // Clearly wrong call according to the group
    baseDelta = -(rng.nextInt(2, 3))
    label = 'negative'
    description = 'the playing group is unsettled — a popular, respected leader has been moved on'
  }

  // Popular players being removed amplify the negative squad mood
  if (popularity > 0.72 && baseDelta < 0) {
    baseDelta -= 1
    label = 'negative'
  }

  // Trade requests or public criticism further damage the squad atmosphere
  if (reactionType === 'trade-request' || reactionType === 'public-criticism') {
    baseDelta -= 1
    label = 'negative'
    description = 'the captaincy fallout has created undercurrents of unrest in the playing group'
  }

  return {
    label,
    moraleDelta: clamp(baseDelta, -3, 3),
    description,
  }
}

// ── Media narrative ───────────────────────────────────────────────────────────

function buildMediaNarrative(
  stripped: Player,
  newCaptain: Player | null,
  club: Club,
  reactionType: CaptaincyReactionType,
  fairnessScore: number,
  rng: SeededRNG,
): CaptaincyMediaNarrative | undefined {
  const sn = `${stripped.firstName} ${stripped.lastName}`
  const cn = club.abbreviation
  const ncn = newCaptain ? `${newCaptain.firstName} ${newCaptain.lastName}` : undefined

  switch (reactionType) {
    case 'trade-request': {
      const headlines = [
        `${sn} seeks trade from ${cn} after captaincy stripped`,
        `${cn} faces trade request from ex-captain ${sn}`,
        `Captaincy shake-up triggers trade bid — ${sn} wants out`,
      ]
      const bodies = [
        `${cn}'s ${sn} is seeking a trade after being removed from the captaincy, sources have confirmed. The ${stripped.age}-year-old, who served as club captain, is understood to have notified the football department of his desire to explore options elsewhere. The club now faces a delicate negotiation during the trade period.`,
        `The captaincy transition at ${cn} has taken a dramatic turn with ${sn} formally requesting a trade. Insiders say the decision to strip him of the armband was the catalyst, and he is now actively exploring opportunities at rival clubs ahead of the trade deadline.`,
      ]
      return {
        headline: rng.pick(headlines),
        body: rng.pick(bodies),
        tone: 'controversy',
        boardInstabilityDelta: rng.nextInt(6, 10),
        fanSatisfactionDelta: -(rng.nextInt(4, 8)),
      }
    }

    case 'public-criticism': {
      const headlines = [
        `${sn} breaks silence on ${cn}'s captaincy decision`,
        `${cn} under fire as ${sn} questions leadership process`,
        `Fallout grows at ${cn}: ${sn} speaks out publicly`,
      ]
      const bodies = [
        `${sn} has spoken publicly about being stripped of the captaincy at ${cn}, questioning the process and communication surrounding the change. The comments have drawn swift media attention and increased scrutiny on the club's football department at a sensitive time of year.`,
        `${cn}'s captaincy controversy has escalated after ${sn} took aim at the club publicly, suggesting the decision lacked transparency. Football department officials are understood to be managing the fallout carefully, mindful of the impact on broader player relations and supporter sentiment.`,
      ]
      return {
        headline: rng.pick(headlines),
        body: rng.pick(bodies),
        tone: 'controversy',
        boardInstabilityDelta: rng.nextInt(8, 14),
        fanSatisfactionDelta: -(rng.nextInt(5, 10)),
      }
    }

    case 'quiet-resentment': {
      // Only generate a rumour if ambition is high enough to leak to press
      if (stripped.personality.ambition < 68 && !rng.chance(0.3)) return undefined
      const headlines = [
        `Sources: ${sn} unhappy with ${cn} captaincy decision`,
        `Questions raised over ${cn} leadership change`,
        `Tension brewing at ${cn} after captaincy swap`,
      ]
      const bodies = [
        `Questions are being asked inside ${cn} about the decision to move ${sn} out of the captaincy, with sources suggesting the veteran is privately unhappy with the outcome. The club has not commented publicly but the situation bears watching as the season approaches.`,
        `Insiders at ${cn} describe the mood following the captaincy change as 'tense', with ${sn} understood to have reservations about the process. Whether those private concerns translate into something more significant remains to be seen.`,
      ]
      return {
        headline: rng.pick(headlines),
        body: rng.pick(bodies),
        tone: 'rumour',
        boardInstabilityDelta: rng.nextInt(2, 5),
        fanSatisfactionDelta: -(rng.nextInt(1, 3)),
      }
    }

    case 'loyal-acceptance': {
      // Positive story only if the new captain is clearly better and it's a fair change
      if (!ncn || fairnessScore < 10) return undefined
      return {
        headline: `${cn} names ${ncn} as new captain in smooth leadership transition`,
        body: `${cn} has confirmed ${ncn} as their new captain, with the club describing the process as orderly and forward-looking. Outgoing captain ${sn} is understood to have supported the change, and the playing group transition is expected to be seamless heading into the new season.`,
        tone: 'straight',
        boardInstabilityDelta: -(rng.nextInt(1, 3)),
        fanSatisfactionDelta: rng.nextInt(1, 3),
      }
    }

    case 'motivation-spike':
      // Private matter — no press story
      return undefined
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function processCaptaincyChange(
  strippedPlayerId: string,
  newCaptainId: string | null,
  role: 'captain' | 'vice-captain',
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  clubId: string,
  rng: SeededRNG,
): CaptaincyChangeResult {
  const stripped = players[strippedPlayerId]
  const newCaptain = newCaptainId ? (players[newCaptainId] ?? null) : null
  const club = clubs[clubId]

  if (!stripped || !club) {
    // Fallback — shouldn't happen in practice
    return {
      strippedPlayerId,
      newCaptainId,
      role,
      reaction: {
        type: 'quiet-resentment',
        moraleDelta: -5,
        tradeRequestTriggered: false,
        privateMessage: 'The player accepted the decision quietly.',
      },
      squadResponse: { label: 'neutral', moraleDelta: 0, description: 'no notable squad reaction' },
    }
  }

  const fairnessScore = calcFairnessScore(stripped, newCaptainId, players)

  // VC removal has a softer reaction profile — scale everything down
  const isVC = role === 'vice-captain'
  const vcDampener = isVC ? 0.6 : 1.0

  const reactionType = isVC
    ? ((): CaptaincyReactionType => {
        // VCs rarely trade-request or publicly criticise; dampen to quiet-resentment at most
        const base = selectReactionType(stripped, fairnessScore, rng)
        if (base === 'trade-request') return 'quiet-resentment'
        if (base === 'public-criticism') return 'quiet-resentment'
        return base
      })()
    : selectReactionType(stripped, fairnessScore, rng)

  const baseMoraleDelta = moraleDeltaForReaction(reactionType, rng)
  const moraleDelta = Math.round(baseMoraleDelta * vcDampener)

  const tradeRequestTriggered = !isVC && reactionType === 'trade-request'

  const squadResponse = buildSquadResponse(
    stripped,
    newCaptainId,
    players,
    fairnessScore * vcDampener,
    reactionType,
    rng,
  )

  if (isVC) {
    // Soften squad response for VC changes
    squadResponse.moraleDelta = Math.round(squadResponse.moraleDelta * 0.5)
    if (squadResponse.moraleDelta === 0) squadResponse.label = 'neutral'
  }

  const privateMessage = buildPrivateMessage(
    reactionType,
    stripped,
    newCaptain,
    squadResponse,
    fairnessScore,
    rng,
  )

  const mediaNarrative = !isVC
    ? buildMediaNarrative(stripped, newCaptain, club, reactionType, fairnessScore, rng)
    : undefined

  return {
    strippedPlayerId,
    newCaptainId,
    role,
    reaction: {
      type: reactionType,
      moraleDelta,
      tradeRequestTriggered,
      privateMessage,
    },
    squadResponse,
    mediaNarrative,
  }
}

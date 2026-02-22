import type { AICoachProfile, CoachMediaPersonality, CoachPressQuote } from '@/types/coach'
import { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Template bank
// ---------------------------------------------------------------------------

type QuoteContext = CoachPressQuote['context']
type QuoteTone = CoachPressQuote['tone']

interface QuoteTemplate {
  template: string
  tone: QuoteTone
}

const TEMPLATES: Record<CoachMediaPersonality, Partial<Record<QuoteContext, QuoteTemplate[]>>> = {
  combative: {
    'post-loss': [
      { template: "The scoreboard doesn't reflect how we played.", tone: 'defiant' },
      { template: "I don't think {opponentName} were as good as the result suggests.", tone: 'defiant' },
      { template: 'We were robbed of opportunities. Simple as that.', tone: 'defiant' },
      { template: "Our effort wasn't the problem — we'll look at the decisions around us.", tone: 'deflecting' },
    ],
    'post-win': [
      { template: "That's the {clubName} I've been trying to unleash all year.", tone: 'confident' },
      { template: "People keep doubting us. Tonight was our answer.", tone: 'defiant' },
      { template: "We do it the hard way. Nobody gives us anything.", tone: 'confident' },
    ],
    'pre-match': [
      { template: "We'll match whatever {opponentName} bring.", tone: 'confident' },
      { template: "We go in with nothing to lose and everything to gain.", tone: 'defiant' },
    ],
    trade: [
      { template: "If clubs don't want to deal fairly, we walk away.", tone: 'defiant' },
      { template: 'Our list is our list. We protect what we have.', tone: 'defiant' },
    ],
    draft: [
      { template: "We took who we thought was best. Challenge us on that if you want.", tone: 'defiant' },
    ],
    'mid-season': [
      { template: "Critics can keep writing. We keep playing.", tone: 'defiant' },
    ],
  },
  analytical: {
    'post-loss': [
      { template: 'The metrics told a different story to the scoreboard. We process and move forward.', tone: 'analytical' },
      { template: "Efficiency in the forward half let us down — that's fixable.", tone: 'analytical' },
    ],
    'post-win': [
      { template: 'Our pressure metrics were exceptional — that drove everything.', tone: 'analytical' },
      { template: "The data suggested we had the edge at stoppages, and it showed.", tone: 'analytical' },
    ],
    'pre-match': [
      { template: "{opponentName} present real challenges around the contest. We've prepared for that.", tone: 'cautious' },
      { template: 'Our game plan targets their defensive structure — execution is everything.', tone: 'analytical' },
    ],
    draft: [
      { template: 'The data strongly suggested he was the best value at this selection.', tone: 'analytical' },
      { template: 'Our metrics had him as a top-five talent regardless of position.', tone: 'analytical' },
      { template: "We modelled this pick carefully. We're confident.", tone: 'analytical' },
    ],
    trade: [
      { template: 'The value calculus worked in our favour. We had to move.', tone: 'analytical' },
    ],
    'mid-season': [
      { template: "We're tracking the areas we identified. Progress is incremental.", tone: 'analytical' },
    ],
  },
  expressive: {
    'post-win': [
      { template: "That's the {clubName} I've been waiting to see!", tone: 'confident' },
      { template: "The boys were unbelievable out there. I'm so proud of them.", tone: 'confident' },
      { template: 'Honestly, I had goosebumps. That performance was something special.', tone: 'confident' },
    ],
    'post-loss': [
      { template: 'It hurts. These boys gave everything and it still wasn\'t enough tonight.', tone: 'conceding' },
      { template: "I feel for the players. We'll bounce back — that's who we are.", tone: 'conceding' },
    ],
    'pre-match': [
      { template: "I can't wait. These are the games you play football for.", tone: 'confident' },
      { template: "Our group is flying. We're ready for whatever comes.", tone: 'confident' },
    ],
    trade: [
      { template: 'This deal means the world to the football club. Genuinely excited.', tone: 'confident' },
    ],
    draft: [
      { template: "We love this kid. He's going to be a star.", tone: 'confident' },
    ],
    'mid-season': [
      { template: "We're not where we want to be, but the spirit in that changeroom is incredible.", tone: 'confident' },
    ],
  },
  guarded: {
    'pre-match': [
      { template: "We're focused on our own game.", tone: 'cautious' },
      { template: "It'll be a good contest. That's all I'll say.", tone: 'cautious' },
      { template: "One week at a time. That's how we operate.", tone: 'cautious' },
    ],
    'post-win': [
      { template: 'A good result. Pleasing. We move on to next week.', tone: 'cautious' },
      { template: 'Credit to the players. Execution was good enough today.', tone: 'cautious' },
    ],
    'post-loss': [
      { template: "Not good enough. We'll review it and address it.", tone: 'cautious' },
      { template: "I won't be discussing specifics. We handle these things internally.", tone: 'deflecting' },
    ],
    trade: [
      { template: "We don't comment on trade discussions while they're ongoing.", tone: 'deflecting' },
    ],
    draft: [
      { template: 'We got the player we wanted. Happy with that.', tone: 'cautious' },
    ],
    'mid-season': [
      { template: "We focus on what we can control. That's our message internally.", tone: 'cautious' },
    ],
  },
  diplomatic: {
    'pre-match': [
      { template: '{opponentName} are a quality side. This will test us.', tone: 'cautious' },
      { template: "Great respect for what they've built. Should be a terrific game.", tone: 'cautious' },
    ],
    'post-win': [
      { template: 'Full credit to our players and the preparation from the whole staff.', tone: 'confident' },
      { template: '{opponentName} competed hard. We were just a bit better today.', tone: 'cautious' },
    ],
    'post-loss': [
      { template: "{opponentName} deserved the win. We'll learn from this.", tone: 'conceding' },
      { template: "There are things we can improve. That's our focus now.", tone: 'cautious' },
    ],
    trade: [
      { template: 'These decisions are never easy. We wish everyone involved well.', tone: 'cautious' },
      { template: 'This move made sense for all parties. We\'re happy with how it landed.', tone: 'cautious' },
    ],
    draft: [
      { template: "A great young man. We're excited to help him develop.", tone: 'confident' },
    ],
    'mid-season': [
      { template: "It's a long season. We remain committed to our process.", tone: 'cautious' },
    ],
  },
}

// ---------------------------------------------------------------------------
// Fallback templates
// ---------------------------------------------------------------------------

const FALLBACK_TEMPLATES: QuoteTemplate[] = [
  { template: "We focus on what we can control.", tone: 'cautious' },
  { template: "One game at a time — that's our motto.", tone: 'cautious' },
  { template: "The work continues. We believe in what we're building.", tone: 'confident' },
]

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

function resolveTemplate(
  template: string,
  vars: { clubName?: string; opponentName?: string },
): string {
  return template
    .replace('{clubName}', vars.clubName ?? 'this club')
    .replace('{opponentName}', vars.opponentName ?? 'the opposition')
}

// ---------------------------------------------------------------------------
// Deterministic quote generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic press quote for a coach.
 * Pure function — caller stores the result in coach.recentQuotes (rolling 10).
 */
export function generatePressQuote(
  coach: AICoachProfile,
  context: QuoteContext,
  year: number,
  round: number | null,
  date: string,
  vars: { clubName?: string; opponentName?: string; opponentClubId?: string } = {},
): CoachPressQuote {
  // Deterministic seed from coachId + year + round + context
  const seedStr = `${coach.id}${year}${round ?? 0}${context}`
  let seed = 0
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0
  }
  const rng = new SeededRNG(seed)

  const templates = TEMPLATES[coach.mediaPersonality]?.[context] ?? FALLBACK_TEMPLATES
  const chosen = rng.pick(templates)

  const tone = chosen.tone

  return {
    id: `quote_${coach.id}_${year}_${round ?? 0}_${context}`,
    coachId: coach.id,
    date,
    context,
    opponentClubId: vars.opponentClubId,
    quote: resolveTemplate(chosen.template, vars),
    tone,
  }
}

/**
 * Append a quote to coach.recentQuotes, maintaining a rolling window of 10.
 * Returns the updated array (pure).
 */
export function appendQuote(
  recentQuotes: CoachPressQuote[],
  quote: CoachPressQuote,
): CoachPressQuote[] {
  return [...recentQuotes, quote].slice(-10)
}

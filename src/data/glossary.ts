/**
 * Central glossary of AFL management terms used throughout the application.
 *
 * Each entry has a short `summary` (used in inline TermTooltip popovers) and
 * full `body` paragraphs (used on the Glossary page). Where a rule is
 * controlled by a game setting, `settingKey` identifies the relevant flag and
 * `disabledNote` is appended when that flag is inactive.
 */

import type { RealismSettings } from '@/types/game'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GlossaryCategory =
  | 'salary-cap'
  | 'draft'
  | 'player-lists'
  | 'contracts'
  | 'match-rules'
  | 'season-finals'
  | 'operations'

export const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  'salary-cap': 'Salary Cap',
  'draft': 'Draft & Recruitment',
  'player-lists': 'Player Lists',
  'contracts': 'Contracts',
  'match-rules': 'Match Rules',
  'season-finals': 'Season & Finals',
  'operations': 'Club Operations',
}

export interface GlossaryEntry {
  /** URL-safe identifier, used as page anchor */
  id: string
  /** Display name */
  term: string
  /** Alternative names or abbreviations (searched but not displayed as primary) */
  aliases?: string[]
  category: GlossaryCategory
  /** One-sentence definition shown in inline TermTooltip popovers */
  summary: string
  /** Full definition paragraphs shown on the Glossary page */
  body: string[]
  /**
   * If this rule is governed by a realism toggle, name the key here.
   * The GlossaryPage will check the active setting and append `disabledNote`
   * when the rule is inactive.
   */
  settingKey?: keyof RealismSettings | 'salaryCap'
  /** Note appended when `settingKey` is false in the active game */
  disabledNote?: string
  /** Optional internal link to a related page */
  learnMorePath?: string
  learnMoreLabel?: string
}

// ---------------------------------------------------------------------------
// Glossary entries
// ---------------------------------------------------------------------------

export const GLOSSARY: GlossaryEntry[] = [
  // -------------------------------------------------------------------------
  // Salary Cap
  // -------------------------------------------------------------------------
  {
    id: 'salary-cap',
    term: 'Salary Cap',
    category: 'salary-cap',
    summary:
      'The maximum total wage bill a club may commit to its senior-listed players in a given season.',
    body: [
      'The salary cap sets an upper limit on the total annual player salaries a club can hold on its senior list simultaneously. All senior-listed players count toward this ceiling at their Average Annual Value (AAV).',
      'Cap Room — the difference between the cap ceiling and the total committed salary — represents the funds available to sign or extend players.',
      'Exceeding the cap triggers warnings and, depending on realism settings, financial penalties or disciplinary consequences.',
    ],
    settingKey: 'salaryCap',
    disabledNote: 'The salary cap is disabled in your current game. Player salaries are tracked for financial reporting but do not restrict signings.',
    learnMorePath: '/salary-cap',
    learnMoreLabel: 'Cap Dashboard',
  },
  {
    id: 'hard-cap',
    term: 'Hard Cap',
    aliases: ['Hard Salary Cap'],
    category: 'salary-cap',
    summary:
      'The absolute maximum salary ceiling that no club may exceed under any circumstances.',
    body: [
      'The hard cap is the firm upper limit of total player salary. Unlike a soft cap, no amount of luxury tax payment permits spending above this line — it is a strict ceiling enforced by the AFL.',
      'When the soft cap mechanic is disabled, the hard cap is the only enforced threshold and any excess triggers an immediate cap violation.',
    ],
    settingKey: 'salaryCap',
    disabledNote: 'The salary cap — including the hard cap — is disabled in your current game.',
    learnMorePath: '/salary-cap',
    learnMoreLabel: 'Cap Dashboard',
  },
  {
    id: 'soft-cap',
    term: 'Soft Cap',
    aliases: ['Luxury Cap'],
    category: 'salary-cap',
    summary:
      'A secondary threshold above the hard cap; clubs exceeding it pay a luxury tax but are not in violation of the hard cap rules.',
    body: [
      'The soft cap creates a spending band between the hard cap and an upper luxury threshold. Clubs that spend within this band pay a luxury tax penalty — a financial cost rather than a rules sanction.',
      'This mechanic allows wealthier or well-managed clubs to carry additional payroll at a financial cost, simulating the real AFL\'s cost-of-living and marquee-player allowances.',
      'The soft cap ceiling is typically set at 110% of the hard cap. All spending in the band is penalised dollar-for-dollar (or at a multiplier) as luxury tax.',
    ],
    settingKey: 'softCapSpending',
    disabledNote: 'The soft cap is not active in your current game. The hard cap is the sole enforced threshold.',
    learnMorePath: '/salary-cap',
    learnMoreLabel: 'Cap Dashboard',
  },
  {
    id: 'luxury-tax',
    term: 'Luxury Tax',
    category: 'salary-cap',
    summary:
      'A financial penalty levied on clubs whose total player spend exceeds the soft cap threshold.',
    body: [
      'When a club\'s committed salary exceeds the hard cap ceiling, each dollar of excess is subject to a luxury tax deducted from the club\'s operating budget.',
      'The tax is applied at season end as part of the financial settlement process. Heavy luxury tax bills reduce the club\'s available capital for facilities, staff, and future signings.',
      'The tax rate and the soft cap threshold are both configurable in Game Settings under Salary Cap Rules.',
    ],
    settingKey: 'softCapSpending',
    disabledNote: 'The luxury tax is not active because the soft cap is disabled in your current game.',
    learnMorePath: '/salary-cap',
    learnMoreLabel: 'Cap Dashboard',
  },
  {
    id: 'aav',
    term: 'Average Annual Value',
    aliases: ['AAV'],
    category: 'salary-cap',
    summary:
      'The mean annual cost of a contract, used for salary cap accounting purposes.',
    body: [
      'AAV (Average Annual Value) is calculated by dividing the total contract value by its length. A deal paying $500,000 in year one and $700,000 in year two has an AAV of $600,000.',
      'The AFL uses AAV — not actual year-by-year salary — when assessing cap compliance. This means a back-loaded contract (lower early, higher later) carries the same cap impact as a front-loaded one of equal total value.',
      'When evaluating multi-year deals, always monitor both the AAV (for cap impact) and the year-by-year schedule (for cash-flow planning).',
    ],
    learnMorePath: '/salary-cap',
    learnMoreLabel: 'Cap Dashboard',
  },
  {
    id: 'cap-room',
    term: 'Cap Room',
    aliases: ['Cap Space'],
    category: 'salary-cap',
    summary:
      'The difference between the salary cap ceiling and the club\'s total committed salary; the funds available to sign new players.',
    body: [
      'Cap room = Salary Cap Ceiling minus Total Committed Salary. This is the maximum additional AAV the club can absorb in new contracts without a cap violation.',
      'Rookie-listed players do not count against the senior cap and are excluded from this calculation. Only players on the senior list are included.',
      'Cap room fluctuates as contracts are signed, traded, or expire. Always check available room before making an offer in free agency or a trade that includes salary.',
    ],
    learnMorePath: '/salary-cap',
    learnMoreLabel: 'Cap Dashboard',
  },
  {
    id: 'cap-projection',
    term: 'Cap Projection',
    category: 'salary-cap',
    summary:
      'An estimate of a club\'s committed salary in future seasons, based on current contracts.',
    body: [
      'Cap projections show the total AAV of all contracts that will still be active in years 2, 3, and beyond. Players whose contracts expire before a given year are excluded from that year\'s projection.',
      'Use projections to identify future cap crunches — seasons where a large number of contracts expire simultaneously, or where long-term deals create an unavoidable financial commitment.',
      'Cap projections do not account for inflation, new signings, or rookies promoted to the senior list. Treat them as a floor estimate, not a ceiling.',
    ],
    learnMorePath: '/salary-cap',
    learnMoreLabel: 'Cap Dashboard',
  },
  {
    id: 'salary-dump',
    term: 'Salary Dump Trade',
    aliases: ['Salary Dump', 'Cap Dump'],
    category: 'salary-cap',
    summary:
      'A trade in which a club offloads a high-value contract to free cap space, typically accepting an inferior player return.',
    body: [
      'A salary dump trade occurs when a club prioritises cap relief over player quality. The trading club accepts less value in return — often a mid-round draft pick or a fringe player — in exchange for removing a large contract from their books.',
      'The receiving club assumes the full salary obligation. This can be attractive if the receiving club has ample cap space and values the incoming player.',
      'Salary dumps are most common during cap-crunch offseasons, when a club needs immediate space to re-sign key players or pursue free agents.',
    ],
    settingKey: 'salaryDumpTrades',
    disabledNote: 'Salary dump trades are disabled in your current realism settings. All trades must pass standard value-balance checks.',
  },
  {
    id: 'dead-cap',
    term: 'Dead Cap',
    aliases: ['Dead Money'],
    category: 'salary-cap',
    summary:
      'Salary cap space consumed by a player no longer on the list, typically as a penalty for delisting, trading, or contract termination.',
    body: [
      'When a player is delisted with years remaining on their contract, or traded with a portion of their salary attached, the club may be obligated to carry a dead cap charge — a notional salary deduction against the cap for a player who contributes nothing on the field.',
      'Dead cap is most likely to arise from salary dump trades and from delisting veteran players mid-contract.',
      'Monitor dead cap exposure carefully: it limits the ability to sign replacements and may persist for multiple seasons.',
    ],
  },

  // -------------------------------------------------------------------------
  // Draft & Recruitment
  // -------------------------------------------------------------------------
  {
    id: 'national-draft',
    term: 'National Draft',
    aliases: ['AFL Draft', 'Draft'],
    category: 'draft',
    summary:
      'The annual selection event at which clubs choose from the eligible prospect pool in reverse ladder order.',
    body: [
      'The national draft is held at the end of each season. Clubs select prospects in reverse ladder order — the worst-finishing club picks first, giving struggling sides first access to the top talent.',
      'Each club typically holds one pick per round, though picks can be traded between clubs during trade periods. Multiple rounds are conducted until the available prospect pool is exhausted.',
      'Prospects not selected in the national draft may enter the rookie draft, where clubs can add them to their rookie list at the reduced rookie salary scale.',
    ],
    learnMorePath: '/draft',
    learnMoreLabel: 'Go to Draft',
  },
  {
    id: 'rookie-draft',
    term: 'Rookie Draft',
    aliases: ['Rookie Selection'],
    category: 'draft',
    summary:
      'A secondary draft following the national draft; prospects selected enter clubs on the rookie list at the rookie salary scale.',
    body: [
      'The rookie draft provides clubs with an additional avenue to add developing talent at a reduced financial cost. Players drafted in this phase are placed on the rookie list, not the senior list.',
      'Clubs can also use rookie selections to acquire players delisted by other clubs, effectively recycling talent through the competition.',
      'Not all rookie selections develop into senior-level players. The rookie draft is best used to cover depth and to monitor high-ceiling players who were not national drafted.',
    ],
    learnMorePath: '/draft',
    learnMoreLabel: 'Go to Draft',
  },
  {
    id: 'draft-order',
    term: 'Draft Order',
    aliases: ['Pick Order', 'Draft Sequence'],
    category: 'draft',
    summary:
      'The sequence in which clubs select during the draft, determined by the inverse of the final regular-season ladder.',
    body: [
      'The club finishing last on the ladder holds pick 1. The premiership-winning club holds the final pick in round one (typically pick 18 in an 18-club competition).',
      'Where clubs have traded picks, those picks transfer to the acquiring club at the same position in the sequence. Trades can significantly alter the effective draft order.',
    ],
    learnMorePath: '/draft',
    learnMoreLabel: 'Go to Draft',
  },
  {
    id: 'draft-variance',
    term: 'Draft Variance',
    aliases: ['Prospect Variance'],
    category: 'draft',
    summary:
      'Natural unpredictability in prospect development; highly-graded players may under-perform, while late selections may exceed expectations.',
    body: [
      'Even elite prospects do not always fulfil their potential. Draft variance introduces realistic uncertainty: the actual development trajectory of a prospect can deviate significantly from their pre-draft scouting grade.',
      'With draft variance enabled, busts at the top of the draft and late-round breakout players are both possible outcomes. This reflects the genuine difficulty of predicting athletic development.',
      'Use multiple scouting reports and consider the confidence rating carefully. High-confidence elite reports are more reliable; low-confidence reports should be treated as indicative only.',
    ],
    settingKey: 'draftVariance',
    disabledNote: 'Draft variance is disabled in your current game. Prospects develop in line with their scouted grade with minimal deviation.',
    learnMorePath: '/draft',
    learnMoreLabel: 'Go to Draft',
  },
  {
    id: 'father-son',
    term: 'Father-Son Rule',
    aliases: ['Father Son', 'FS Rule'],
    category: 'draft',
    summary:
      'A rule permitting a club with a historic connection to a prospect\'s father to match any competing bid at the national draft.',
    body: [
      'If a prospect\'s father played a minimum number of games for a specific AFL club, that club holds the right of first refusal at the national draft.',
      'The process works via a bid: a competing club nominates the prospect at their pick, effectively "bidding" for them. The linked club then decides whether to match the bid and spend their own equivalent pick to secure the player.',
      'Matching the bid costs the linked club a pick of equivalent value. If the linked club declines or cannot match, the bidding club acquires the player.',
    ],
    settingKey: 'ngaAcademy',
    disabledNote: 'The Father-Son rule is disabled in your current realism settings.',
    learnMorePath: '/draft',
    learnMoreLabel: 'Go to Draft',
  },
  {
    id: 'nga-rule',
    term: 'Academy Rule',
    aliases: ['NGA Rule', 'Next Generation Academy', 'NGA', 'Academy Pick'],
    category: 'draft',
    summary:
      'A rule allowing clubs to match draft bids for prospects developed through their affiliated academy programs.',
    body: [
      'AFL clubs operate affiliated academy programs (Next Generation Academies and standard academies) to develop young talent. If a prospect nominates for the draft via one of these pathways, the affiliated club holds matching rights.',
      'The bid-and-match process mirrors the Father-Son rule: a competing club bids at their pick, and the academy club decides whether to match the bid at an equivalent cost.',
      'Academy prospects are often known quantities — the affiliated club has had years to assess them — making matching decisions more informed than at-large draft selections.',
    ],
    settingKey: 'ngaAcademy',
    disabledNote: 'The Academy (NGA) rule is disabled in your current realism settings.',
    learnMorePath: '/draft',
    learnMoreLabel: 'Go to Draft',
  },
  {
    id: 'compensation-pick',
    term: 'Compensation Pick',
    aliases: ['Comp Pick', 'Compensation Selection'],
    category: 'draft',
    summary:
      'An additional draft selection awarded to a club that lost a significant player to another club via free agency.',
    body: [
      'When a club loses a highly-valued player through free agency — particularly restricted free agency where the player\'s existing club chose not to match — they may be awarded a compensatory draft pick.',
      'The pick\'s position in the draft order reflects the value of the departed player. Elite free agent losses attract better compensation picks.',
      'Compensation picks are added to the acquiring club\'s draft allotment at the end of the relevant round, supplementing rather than replacing their existing selections.',
    ],
    learnMorePath: '/draft',
    learnMoreLabel: 'Go to Draft',
  },
  {
    id: 'bid',
    term: 'Bid',
    aliases: ['Draft Bid', 'Academy Bid', 'Father-Son Bid'],
    category: 'draft',
    summary:
      'In the Father-Son or Academy context, a competing club\'s formal selection of a linked prospect, which triggers the linked club\'s matching right.',
    body: [
      'A bid occurs when a club uses one of their draft picks to select a Father-Son or Academy-linked prospect, knowing that the linked club holds the right to match.',
      'The bidding club commits their pick regardless of the outcome: if the linked club matches, the bidding club loses their pick and the linked club acquires the prospect; if the linked club declines, the bidding club keeps the player.',
      'Bidding strategy matters — bidding too early wastes a high pick on a player the linked club will match; bidding too late risks another club making a stronger bid first.',
    ],
    settingKey: 'ngaAcademy',
    disabledNote: 'The bid mechanism is not active because Academy and Father-Son rules are disabled in your current game.',
    learnMorePath: '/draft',
    learnMoreLabel: 'Go to Draft',
  },
  {
    id: 'prospect-tier',
    term: 'Prospect Tier',
    aliases: ['Draft Tier', 'Scouting Tier', 'Draft Grade'],
    category: 'draft',
    summary:
      'A scout\'s projection of a prospect\'s expected draft range, from Elite through to Rookie List.',
    body: [
      'Tiers provide a shorthand for where a prospect is expected to be selected and their likely ceiling:',
      'Elite — projected top-10 selections; generational or near-generational talent expected to contribute at AFL level within their first season.',
      'First Round — projected picks 11–18; likely to contribute at AFL level within one to two seasons.',
      'Second Round — projected picks 19–40; solid depth prospects requiring development time.',
      'Late — picks 40 and beyond; speculative selections with specific physical or skill attributes to develop.',
      'Rookie List — unlikely to be national drafted; suitable for rookie draft selection only.',
      'Tier estimates are subject to draft variance and scouting confidence — treat them as projections, not guarantees.',
    ],
    learnMorePath: '/draft',
    learnMoreLabel: 'Go to Draft',
  },
  {
    id: 'scout-confidence',
    term: 'Scout Confidence',
    aliases: ['Confidence Rating', 'Scouting Confidence'],
    category: 'draft',
    summary:
      'A percentage indicating how certain a scout is about their evaluation of a prospect; low confidence means the true tier may differ significantly.',
    body: [
      'Confidence (0–100%) reflects the reliability of a scout\'s assessment. A 90% confidence rating on an Elite classification is a strong signal; a 25% confidence rating on the same grade means the scout has limited data and the true tier could be substantially different.',
      'Confidence increases as scouts spend more time evaluating a prospect in their assigned region during the pre-draft period.',
      'When comparing prospects, weigh confidence alongside tier. A high-confidence Second Round prospect may represent a safer selection than a low-confidence First Round prospect.',
    ],
    learnMorePath: '/scouting',
    learnMoreLabel: 'Go to Scouting',
  },
  {
    id: 'scouting-region',
    term: 'Scouting Region',
    aliases: ['Region', 'Recruiting Region'],
    category: 'draft',
    summary:
      'A geographic zone assigned to a scout that focuses their evaluations on prospects from that area.',
    body: [
      'Australia is divided into seven scouting regions: VIC, SA, WA, NSW/ACT, QLD, TAS, and NT. Assigning a scout to a region boosts the confidence and accuracy of reports on all prospects from that region.',
      'Different regions produce different volumes and positional profiles of talent. VIC historically generates the highest volume; WA and SA have strong midfielder pipelines.',
      'Clubs with scouts in multiple regions gain broader prospect coverage, but depth of knowledge in any single region is reduced relative to a club that concentrates on fewer zones.',
    ],
    learnMorePath: '/scouting',
    learnMoreLabel: 'Go to Scouting',
  },

  // -------------------------------------------------------------------------
  // Player Lists
  // -------------------------------------------------------------------------
  {
    id: 'senior-list',
    term: 'Senior List',
    aliases: ['Main List', 'AFL List'],
    category: 'player-lists',
    summary:
      'The primary AFL squad; all senior-listed players count toward the salary cap and are eligible for match-day selection.',
    body: [
      'The senior list is the primary roster from which your 22-man match-day lineup is drawn. Each club is permitted up to 38 senior-listed players (configurable in Game Settings).',
      'All players on the senior list count against the salary cap at their full AAV. Only senior-listed players can be selected for AFL matches unless a rookie-listed player is formally elevated.',
      'List composition is managed during the pre-season and end-of-season trade and delisting windows.',
    ],
    learnMorePath: '/squad',
    learnMoreLabel: 'View Squad',
  },
  {
    id: 'rookie-list',
    term: 'Rookie List',
    aliases: ['Development List'],
    category: 'player-lists',
    summary:
      'A secondary development list of up to six players paid at a reduced scale, who do not count toward the senior salary cap.',
    body: [
      'Rookie-listed players are paid at the rookie salary scale — typically $75,000 to $100,000 per season — and their salaries are covered by a separate, smaller allowance that does not form part of the senior cap.',
      'Rookies may be elevated to the senior list for individual matches (such as emergency cover for injuries) without permanently changing their status, subject to paperwork deadlines.',
      'At season end, clubs can promote rookies to the senior list (they then count against the full cap) or delist them to create space for new draftees.',
    ],
    learnMorePath: '/squad',
    learnMoreLabel: 'View Squad',
  },
  {
    id: 'list-lodgement',
    term: 'List Lodgement',
    aliases: ['List Submission', 'List Deadline'],
    category: 'player-lists',
    summary:
      'The formal submission of a club\'s final player list to the AFL within a prescribed administrative window.',
    body: [
      'List lodgement is the administrative step by which a club formally confirms its squad composition to the AFL. Lists must be submitted within specific windows — typically at the close of the pre-season trade period and again after the national draft.',
      'Players added or removed from the list outside of these windows are subject to league scrutiny. Lodgement deadlines apply independently to the senior list and the rookie list.',
    ],
    learnMorePath: '/rules',
    learnMoreLabel: 'View Rulebook',
  },
  {
    id: 'state-league-contract',
    term: 'State League Contract',
    aliases: ['VFL Contract', 'Reserves Contract', 'State League'],
    category: 'player-lists',
    summary:
      'A playing agreement enabling a player to represent an affiliated state-league club while remaining on the AFL club\'s senior list.',
    body: [
      'State league contracts allow players to gain competitive football below AFL level, particularly during periods of non-selection. The player remains nominally attached to the AFL club and subject to their match-day call-up authority.',
      'State league appearances count toward a player\'s development metrics. Consistent form at state-league level can support a case for senior selection.',
      'Only a defined number of players can hold state league contracts simultaneously. The number is set in Game Settings under List Rules.',
    ],
    learnMorePath: '/state-leagues',
    learnMoreLabel: 'State Leagues',
  },
  {
    id: 'elevation',
    term: 'Elevation',
    aliases: ['Emergency Elevation', 'Rookie Elevation'],
    category: 'player-lists',
    summary:
      'The temporary promotion of a rookie-listed player to the senior list for a specific match, without permanently changing their list status.',
    body: [
      'A club may elevate a rookie to the senior list as a designated emergency ahead of a match if a senior player is unavailable due to injury or suspension.',
      'Elevation is a one-match measure and does not alter the player\'s long-term list status. The player returns to the rookie list after the match unless a permanent promotion is subsequently lodged.',
      'Elevated players carry their standard rookie salary during the elevated match; they do not immediately attract senior cap charges.',
    ],
    learnMorePath: '/squad',
    learnMoreLabel: 'View Squad',
  },

  // -------------------------------------------------------------------------
  // Contracts
  // -------------------------------------------------------------------------
  {
    id: 'contract-length',
    term: 'Contract Length',
    aliases: ['Contract Term', 'Contract Duration'],
    category: 'contracts',
    summary:
      'The number of seasons covered by a player\'s agreement; longer deals provide roster certainty at the cost of future flexibility.',
    body: [
      'Contracts range from one to five years (or longer for marquee signings). A longer term secures the player against rival approaches but locks in cap space and limits the club\'s ability to respond to form or injury changes.',
      'Shorter contracts typically attract higher annual values — players accept a premium to offset the re-negotiation risk. Long-term contracts generally involve a slight discount on annual value in exchange for security.',
      'When offering multi-year contracts, model the cap projection impact across every year of the term before finalising terms.',
    ],
    learnMorePath: '/contracts',
    learnMoreLabel: 'Manage Contracts',
  },
  {
    id: 'year-by-year',
    term: 'Year-by-Year Salary',
    aliases: ['YBY', 'Annual Salary Schedule'],
    category: 'contracts',
    summary:
      'A contract structure in which each season\'s salary is specified individually, with the AAV calculated as the mean across all years.',
    body: [
      'Rather than a flat annual salary, a year-by-year contract specifies the exact payment for each season. For example, a three-year deal might pay $400,000 in year one, $550,000 in year two, and $700,000 in year three.',
      'The AFL uses the AAV — the mean across all years — for cap compliance purposes. The actual cash-flow schedule matters for club budget planning even when the cap impact is constant.',
      'Front-loaded contracts (higher early, lower late) transfer financial risk to the club; back-loaded contracts transfer it to the player.',
    ],
    learnMorePath: '/contracts',
    learnMoreLabel: 'Manage Contracts',
  },
  {
    id: 'incentive-clause',
    term: 'Incentive Clause',
    aliases: ['Performance Clause', 'Escalator', 'Bonus Clause'],
    category: 'contracts',
    summary:
      'A conditional payment that increases a player\'s effective salary when specified performance benchmarks are met.',
    body: [
      'Incentive clauses can be tied to statistics (disposal counts, goal tallies, Brownlow votes), team outcomes (finals appearances, premierships), or individual honours (All-Australian selection).',
      'When an incentive is triggered, the additional payment is counted against the salary cap in the year it occurs. Clubs must ensure sufficient cap headroom to absorb incentive payments during the season.',
      'Incentives are a useful tool in negotiations with players who believe their market value is higher than the club\'s assessment — they allow performance to close the gap.',
    ],
    learnMorePath: '/contracts',
    learnMoreLabel: 'Manage Contracts',
  },
  {
    id: 'trade-block',
    term: 'Trade Block',
    aliases: ['Available for Trade'],
    category: 'contracts',
    summary:
      'A formal signal that a club is willing to negotiate the trade of a listed player; does not obligate acceptance of any offer.',
    body: [
      'Placing a player on the trade block indicates to rival clubs that the club is open to trade discussions. AI clubs periodically browse the trade block and may submit offers.',
      'Being on the trade block does not bind the club to accept any particular offer. The manager retains full authority to negotiate, counter, or decline all approaches.',
      'Players can be removed from the trade block at any time. Some players may request to be placed on the block if their role disputes escalate.',
    ],
    learnMorePath: '/trades',
    learnMoreLabel: 'Go to Trades',
  },

  // -------------------------------------------------------------------------
  // Match Rules
  // -------------------------------------------------------------------------
  {
    id: 'interchange',
    term: 'Interchange',
    aliases: ['Bench', 'Interchange Bench', 'Rotating Bench'],
    category: 'match-rules',
    summary:
      'The rotation bench from which players cycle on and off the field throughout a match.',
    body: [
      'AFL teams carry four interchange players who rotate freely with on-field players throughout each quarter. There is no limit on how often an individual player can cycle on and off.',
      'Effective interchange management is critical for managing player fatigue and exploiting positional mismatches as they develop during a match.',
      'The number of interchange bench spots is configurable in Game Settings under Match Rules.',
    ],
    learnMorePath: '/lineup',
    learnMoreLabel: 'Manage Lineup',
  },
  {
    id: 'medical-substitute',
    term: 'Medical Substitute',
    aliases: ['Sub', 'Yellow Vest', 'Substitute'],
    category: 'match-rules',
    summary:
      'A designated 23rd player who may permanently replace an injured or concussed teammate; identified on the field by a yellow vest.',
    body: [
      'The medical substitute is a 23rd player on the team sheet available to replace any of the 22 selected players in the event of injury or concussion. The substitute is identified by wearing a yellow vest during the early stages of the match.',
      'Once used, the medical sub\'s vest is removed and they play normally for the remainder of the match. The player they replaced cannot return to the field.',
      'The medical substitute rule is distinct from standard interchange: it is a permanent one-for-one replacement specifically for medical situations, not a tactical rotation.',
    ],
    learnMorePath: '/lineup',
    learnMoreLabel: 'Manage Lineup',
  },
  {
    id: 'percentage',
    term: 'Percentage',
    aliases: ['For-Against', 'F/A', 'Ratio'],
    category: 'match-rules',
    summary:
      'The ratio of total points scored to total points conceded, multiplied by 100; the primary tiebreaker when clubs share ladder points.',
    body: [
      'Percentage = (Total Points Scored / Total Points Conceded) × 100. A club that scores 1,200 points and concedes 1,000 has a percentage of 120.0.',
      'Percentage is the first tiebreaker when two or more clubs finish a season on equal competition points. A strong percentage can determine finals eligibility in a congested eighth-place race.',
      'Running up the score in winnable games, and defending strongly in losses to minimise the margin, are both valid approaches to maintaining a competitive percentage.',
    ],
  },
  {
    id: 'bye-round',
    term: 'Bye Round',
    aliases: ['Bye', 'Club Bye'],
    category: 'match-rules',
    summary:
      'A scheduled round in which a club does not play, providing a rest period and additional preparation time.',
    body: [
      'Each club receives one or more bye rounds during the home-and-away season. The bye provides an opportunity for player recovery, injury rehabilitation, and intensive preparation for the following opponent.',
      'The number and timing of byes are determined by the fixture generator based on season length and team count settings.',
    ],
  },
  {
    id: 'ladder-points',
    term: 'Ladder Points',
    aliases: ['Competition Points', 'League Points', 'Points'],
    category: 'match-rules',
    summary:
      'The competition points awarded for each match result, used to determine final ladder positions.',
    body: [
      'The standard points allocation is 4 points for a win, 2 points for a draw, and 0 points for a loss. These values are configurable in Game Settings.',
      'Clubs are ranked on the ladder by total competition points. Percentage serves as the primary tiebreaker when clubs are level on points.',
      'In non-standard competition formats, the points system may be adjusted to reflect the competition structure.',
    ],
    learnMorePath: '/rules',
    learnMoreLabel: 'View Rulebook',
  },

  // -------------------------------------------------------------------------
  // Season & Finals
  // -------------------------------------------------------------------------
  {
    id: 'finals-seeding',
    term: 'Finals Seeding',
    aliases: ['Seeding', 'Finals Position'],
    category: 'season-finals',
    summary:
      'Placement within the finals bracket, determined by ladder position at the conclusion of the regular season.',
    body: [
      'Finals seeding is set by the end-of-season ladder. The first-placed club receives the 1 seed, the second-placed club the 2 seed, and so on. Seeding determines which matches a club participates in and, where applicable, which club receives home-ground advantage.',
      'In the default AFL page system, the top two seeds hold a double chance — they can lose their first final and still progress through a second-chance fixture.',
    ],
    learnMorePath: '/rules',
    learnMoreLabel: 'View Rulebook',
  },
  {
    id: 'double-chance',
    term: 'Double Chance',
    aliases: ['Second Chance', 'Double Bite'],
    category: 'season-finals',
    summary:
      'An advantage in the page-system finals whereby the top two seeds can lose their first final and still have an opportunity to progress.',
    body: [
      'In the AFL\'s page finals system, clubs finishing first and second enter their finals in qualifying finals. Even if they lose, they drop to a preliminary final — they have a second opportunity to advance to the grand final.',
      'Clubs finishing third and fourth who win their qualifying final also advance directly to the preliminary final. This creates a double-chance benefit for the top four seeds, with the bottom four seeds eliminated immediately if they lose their first final.',
      'Finishing in the top two is therefore disproportionately valuable. The double chance significantly increases the probability of reaching the grand final compared to fifth-to-eighth position.',
    ],
    learnMorePath: '/rules',
    learnMoreLabel: 'View Rulebook',
  },
  {
    id: 'home-ground-finals',
    term: 'Home-Ground Finals',
    aliases: ['Home Finals', 'Home Advantage Finals'],
    category: 'season-finals',
    summary:
      'A finals model in which the higher-seeded club has the right to host the match at their home venue.',
    body: [
      'When home-ground finals are enabled, the higher seed in each matchup plays at their designated home ground rather than at a neutral or fixed venue. This provides a logistical and atmospheric advantage to teams that finished the regular season strongly.',
      'Home-ground finals add material value to finishing higher on the ladder, reinforcing competition for top-four and top-eight positions throughout the season.',
    ],
    learnMorePath: '/rules',
    learnMoreLabel: 'View Rulebook',
  },
  {
    id: 'grand-final-venue',
    term: 'Grand Final Venue',
    aliases: ['GF Venue', 'Decider Venue'],
    category: 'season-finals',
    summary:
      'The stadium at which the season\'s premiership decider is played; configurable between fixed, rotating, and top-seed home-ground options.',
    body: [
      'Three modes are available for the grand final venue. Fixed mode designates a specific stadium (traditionally the MCG) as the permanent grand final host. Random mode selects a neutral venue by ballot prior to the finals series. Top-Club mode awards the grand final hosting rights to the higher-seeded finalist — a significant incentive for finishing first or second.',
      'The selected mode is applied consistently for all seasons within a game and can be set in Game Settings under Finals Configuration.',
    ],
    learnMorePath: '/game-settings',
    learnMoreLabel: 'Finals Settings',
  },

  // -------------------------------------------------------------------------
  // Club Operations
  // -------------------------------------------------------------------------
  {
    id: 'tribunal',
    term: 'Tribunal',
    aliases: ['Tribunal Hearing', 'Disciplinary Tribunal'],
    category: 'operations',
    summary:
      'The disciplinary body that adjudicates reports of on-field misconduct; the Match Review Panel issues charges and the tribunal conducts hearings.',
    body: [
      'The tribunal is the AFL\'s disciplinary adjudication body. It hears contested charges following incidents reported during matches. Players can accept a recommended suspension (saving legal costs and time) or contest the charge at a tribunal hearing.',
      'Outcomes at the tribunal depend on the graded charge, the player\'s prior record, legal representation, and the plea entered. A not-guilty finding clears the player; a guilty finding at tribunal may attract a higher penalty than the original recommendation.',
      'Tribunal exposure can be managed by setting cautious in-match aggression levels and identifying players with prior records.',
    ],
    learnMorePath: '/tribunal',
    learnMoreLabel: 'Go to Tribunal',
  },
  {
    id: 'mrp',
    term: 'Match Review Panel',
    aliases: ['MRP'],
    category: 'operations',
    summary:
      'The independent panel that reviews video evidence of reported incidents and issues graded charges before any tribunal hearing.',
    body: [
      'The Match Review Panel (MRP) is the first step in the AFL\'s disciplinary process. It assesses video evidence from reported incidents and classifies each by contact type and severity, resulting in a graded charge (low, medium, high, or severe).',
      'The MRP\'s graded charge carries an associated penalty range. Players and clubs may accept the charge directly or contest at the tribunal.',
    ],
    learnMorePath: '/tribunal',
    learnMoreLabel: 'Go to Tribunal',
  },
  {
    id: 'suspension',
    term: 'Suspension',
    aliases: ['Ban', 'Rubbed Out'],
    category: 'operations',
    summary:
      'A penalty banning a player from selection for a set number of matches, issued following a tribunal guilty finding.',
    body: [
      'Suspended players are ineligible for senior selection for the duration of their ban. Suspension weeks count sequentially through matches the player\'s club plays in; finals matches count, but state-league appearances do not reduce a senior suspension.',
      'Prior offences, the severity of the incident, and legal representation choices all affect the number of weeks handed down. Longer suspensions can significantly disrupt match-day planning.',
    ],
    learnMorePath: '/tribunal',
    learnMoreLabel: 'Go to Tribunal',
  },
  {
    id: 'brownlow-medal',
    term: 'Brownlow Medal',
    aliases: ['Brownlow', 'Charlie'],
    category: 'operations',
    summary:
      'The AFL\'s award for the fairest and best player in the home-and-away season, determined by umpire votes (3-2-1 per match).',
    body: [
      'After each home-and-away round, the field umpires cast votes for the three fairest and best players — awarding 3 votes to the best, 2 to second, and 1 to third. Players suspended during the season are ineligible for the medal even if they accumulate the most votes.',
      'The vote counts are kept secret until the Brownlow Medal ceremony, held on the Monday before the grand final.',
      'Winning the Brownlow is one of the most prestigious individual honours in the game and typically increases a player\'s contract demands at renegotiation.',
    ],
    settingKey: 'brownlowNight',
    disabledNote: 'Brownlow Night ceremony is disabled in your current game. Votes are revealed as they accumulate rather than at a formal ceremony.',
    learnMorePath: '/brownlow-night',
    learnMoreLabel: 'Brownlow Night',
  },
  {
    id: 'board-pressure',
    term: 'Board Pressure',
    aliases: ['Board Expectations', 'Job Security'],
    category: 'operations',
    summary:
      'The formal accountability mechanism by which the club board assesses coaching performance against pre-season expectations.',
    body: [
      'At the start of each season, the club board sets an expectation based on the previous year\'s finish and the club\'s perceived trajectory. If results fall short of that expectation, board pressure rises and the coaching team\'s job security declines.',
      'Sustained underperformance against expectations can result in dismissal at season end. Exceeding expectations builds board support and increases the latitude available for bold list decisions.',
      'Board politics (if enabled) introduces a secondary layer: internal factions within the board can amplify or mitigate pressure depending on club dynamics.',
    ],
    settingKey: 'boardPressure',
    disabledNote: 'Board pressure is disabled in your current realism settings. Your coaching position is not affected by season results.',
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lookup a glossary entry by its id. */
export function getGlossaryEntry(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((e) => e.id === id)
}

/** All unique categories present in the glossary. */
export const GLOSSARY_CATEGORIES = Array.from(
  new Set(GLOSSARY.map((e) => e.category)),
) as GlossaryCategory[]

/**
 * Return all terms that match a search string (term name, aliases, summary, body).
 */
export function searchGlossary(query: string): GlossaryEntry[] {
  const q = query.toLowerCase().trim()
  if (!q) return GLOSSARY
  return GLOSSARY.filter((e) => {
    if (e.term.toLowerCase().includes(q)) return true
    if (e.aliases?.some((a) => a.toLowerCase().includes(q))) return true
    if (e.summary.toLowerCase().includes(q)) return true
    if (e.body.some((p) => p.toLowerCase().includes(q))) return true
    return false
  })
}

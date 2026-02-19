/**
 * Central repository of contextual help content for the tutorial system.
 * Each entry has a title and one or more body paragraphs.
 */

export interface HelpEntry {
  title: string
  body: string[]
  /** Optional link path (react-router) to dive deeper */
  learnMorePath?: string
  learnMoreLabel?: string
}

export const HELP_CONTENT = {
  // -------------------------------------------------------------------------
  // List Rules
  // -------------------------------------------------------------------------
  'list-rules': {
    title: 'AFL List Rules',
    body: [
      'Each AFL club maintains a senior list (up to 38 players) and an optional rookie list (up to 6 players). The combined total must not exceed these limits at any point during the season.',
      'Players on the senior list earn standard AFL contracts and count fully toward the salary cap. Rookie-listed players are paid at a reduced rookie-scale salary and have a separate, smaller cap impact.',
      'During the pre-season list lodgement period you can promote rookies to the senior list (counts against cap), demote senior players to the rookie list (frees cap space), or delist players entirely.',
    ],
    learnMorePath: '/rules',
    learnMoreLabel: 'View Rulebook',
  },

  'senior-list': {
    title: 'Senior List',
    body: [
      'The senior list is your primary roster. Each club may carry up to 38 players (configurable in Game Settings). All senior-listed players count against the salary cap at their full contract value.',
      'Only senior-listed players can be selected in your 22-man AFL match-day lineup. Players on the rookie list or state league contracts are ineligible for senior selection unless promoted.',
    ],
  },

  'rookie-list': {
    title: 'Rookie List',
    body: [
      'The rookie list holds up to 6 developing players who are paid at the rookie scale (~$75k–$100k). They do not count toward the senior cap ceiling and have a separate, much smaller allowance.',
      'Rookies may be elevated to the senior list for individual matches (e.g., emergency cover for injuries) without permanently changing their status, subject to paperwork deadlines.',
      'At season\'s end you can promote rookies to the senior list or delist them. Promoted rookies then count against the full salary cap.',
    ],
  },

  'list-lodgement': {
    title: 'List Lodgement Periods',
    body: [
      'The AFL defines specific windows when clubs can modify their lists: the Pre-Season Trade Period, the Mid-Season Rookie Elevation window, and the End-of-Season Trade Period.',
      'Outside these windows you cannot add or remove players — plan your list moves in advance by using the Contracts and Scouting screens during the offseason.',
    ],
  },

  // -------------------------------------------------------------------------
  // Salary Cap
  // -------------------------------------------------------------------------
  'salary-cap': {
    title: 'Salary Cap',
    body: [
      'Every AFL club operates under a hard salary cap. The cap ceiling is the maximum total annual value (AAV) of all contracts on your senior list that can be active simultaneously.',
      'Cap Room = Cap Ceiling − Total Committed Salary. This is the space available to sign new players or extend existing contracts.',
      'Exceeding the cap will trigger warnings and, in realistic settings, incur penalties. Monitor your cap room carefully before making offers.',
    ],
    learnMorePath: '/cap',
    learnMoreLabel: 'Open Cap Dashboard',
  },

  'cap-room': {
    title: 'Cap Room',
    body: [
      'Cap Room is the difference between the salary cap ceiling and your total committed salary for the season.',
      'Players on the rookie list do not count against the senior cap. Injured players on long-term injury (LTI) designations may have partial cap relief depending on your settings.',
      'Offseason roster moves, trades, and new signings all affect cap room — always check your remaining space before making an offer.',
    ],
  },

  'luxury-tax': {
    title: 'Luxury Tax',
    body: [
      'If the Soft Cap is enabled, spending beyond the cap ceiling incurs a dollar-for-dollar (or higher) luxury tax penalty applied to the club\'s operating budget.',
      'The luxury tax is intended to discourage cap violations while still allowing cash-rich clubs to spend above the line at a financial cost.',
      'The tax rate and threshold are configurable in Game Settings under Salary Cap rules.',
    ],
  },

  'soft-cap': {
    title: 'Soft Cap',
    body: [
      'The soft cap is a secondary spending threshold set above the hard cap. Spending between the hard cap and the soft cap incurs a financial penalty (luxury tax) but is not a rules violation.',
      'Spending above the soft cap incurs escalating penalties and may attract league sanctions in realistic mode.',
      'Enable or disable the soft cap mechanic in Game Settings → List & Cap Rules.',
    ],
  },

  'cap-projection': {
    title: 'Cap Projection',
    body: [
      'The cap projection shows your committed salary for future seasons based on current contracts. Multi-year deals lock in cap space years in advance.',
      'Use the Year 2 and Year 3 columns to identify looming cap crunches and plan extensions or delistings accordingly.',
    ],
  },

  // -------------------------------------------------------------------------
  // Draft Mechanics
  // -------------------------------------------------------------------------
  'draft-mechanics': {
    title: 'National Draft',
    body: [
      'At the end of each season, clubs select from a pool of draft prospects in reverse ladder order — the worst-performing club picks first.',
      'Each club typically holds one pick per round. Picks can be traded between clubs during trade periods.',
      'The national draft consists of multiple rounds. Prospects not selected in the national draft may enter the rookie draft, where clubs can select them at the rookie scale.',
    ],
    learnMorePath: '/draft',
    learnMoreLabel: 'Go to Draft',
  },

  'rookie-draft': {
    title: 'Rookie Draft',
    body: [
      'The rookie draft follows the national draft. Clubs can select prospects onto their rookie list (up to 6 spots) at the rookie salary scale.',
      'Players selected in the rookie draft are not guaranteed development — some will never play AFL level. Others develop into senior stars.',
      'Clubs can also use rookie picks to acquire players delisted by other clubs (rookie free agency).',
    ],
  },

  'draft-tiers': {
    title: 'Prospect Tiers',
    body: [
      'Scout reports assign prospects a projected tier based on current ability and development ceiling:',
      '• Elite — top 5–10 picks; generational talents',
      '• 1st Round — picks 11–18; likely immediate contributors',
      '• 2nd Round — picks 19–40; solid depth, needs development',
      '• Late — picks 40+; projects, speculative',
      '• Rookie List — unlikely to be national drafted; rookie scale only',
      'Tiers are estimates. Draft variance means busts and late bloomers are common.',
    ],
  },

  'draft-variance': {
    title: 'Draft Variance',
    body: [
      'Even elite prospects don\'t always pan out. With draft variance enabled, actual development deviates from projections — some early picks bust, some late picks become stars.',
      'Use multiple scout reports and consider position scarcity when deciding which prospects to target.',
    ],
  },

  'father-son-nga': {
    title: 'Father-Son & NGA Rules',
    body: [
      'The Father-Son rule allows a club with a historic connection to a prospect\'s father to match any competing bid at the national draft.',
      'The Next Generation Academies (NGA) rule works similarly — clubs that developed a prospect through their academy can match bids within a certain pick-range.',
      'To trigger the match, a competing club must draft the prospect; the linked club then decides whether to match the bid and spend that pick.',
    ],
  },

  // -------------------------------------------------------------------------
  // Scouting
  // -------------------------------------------------------------------------
  'scouting': {
    title: 'Scouting System',
    body: [
      'Scouts gather intelligence on draft prospects in their assigned regions. The more time a scout spends in a region, the more accurate their reports become.',
      'Each scout has a Confidence rating (0–100%) per prospect. Low confidence means the reported tier or overall may be significantly off from reality.',
      'You can assign up to 6 scouts. Higher-rated scouts generate more accurate reports faster.',
    ],
    learnMorePath: '/scouting',
    learnMoreLabel: 'Go to Scouting',
  },

  'scout-confidence': {
    title: 'Scout Confidence',
    body: [
      'Confidence (0–100%) reflects how certain your scout is about a prospect\'s evaluation. A 90% confident "Elite" projection is much more reliable than a 30% confident one.',
      'Low-confidence prospects carry more uncertainty — their true tier may be better or worse than reported. High-confidence reports are worth acting on in the draft.',
      'Confidence increases as scouts spend more time evaluating a prospect in the pre-draft period.',
    ],
  },

  'scouting-regions': {
    title: 'Scouting Regions',
    body: [
      'Australia is divided into 7 scouting regions: VIC, SA, WA, NSW/ACT, QLD, TAS, and NT.',
      'Each region produces different quantities and types of prospects. VIC historically produces the most volume; WA and SA have strong midfielder pipelines.',
      'Assigning a scout to a specific region boosts confidence for all prospects from that region.',
    ],
  },

  // -------------------------------------------------------------------------
  // Venue & Scheduling
  // -------------------------------------------------------------------------
  'venue-scheduling': {
    title: 'Home & Away Scheduling',
    body: [
      'Each club has a designated home venue. The fixture generator assigns home and away games across the 23-round season, with each club receiving roughly equal home games.',
      'Some matches may be scheduled as "neutral venue" games (e.g., country rounds, special events). These are set up in the Calendar view.',
      'Clubs playing at their home venue receive a small crowd advantage that marginally affects match atmosphere ratings.',
    ],
  },

  'grand-final-venue': {
    title: 'Grand Final Venue',
    body: [
      'By default the Grand Final is played at the traditional MCG venue. In Game Settings you can change this to a rotating home-ground model or allow the higher-seeded finalist to host.',
      '"Home Ground" mode awards the grand final to the team with the better regular season record — a significant reward for finishing top of the ladder.',
    ],
  },

  // -------------------------------------------------------------------------
  // Finals
  // -------------------------------------------------------------------------
  'finals-format': {
    title: 'Finals Format',
    body: [
      'The finals system determines how the top clubs at the end of the regular season compete for the premiership.',
      'The default AFL format is a modified page system with 8 teams across 4 weeks:',
      '• Week 1: 1 vs 2 (winner straight to GF), 3 vs 4, 5 vs 8, 6 vs 7',
      '• Week 2: Elimination & qualifier finals',
      '• Week 3: Preliminary finals (semi-finals)',
      '• Week 4: Grand Final',
      'Alternative formats (top 4, top 6, top 10, straight knockout) are available in Game Settings.',
    ],
    learnMorePath: '/game-settings',
    learnMoreLabel: 'Manage Finals Settings',
  },

  'finals-builder': {
    title: 'Custom Finals Builder',
    body: [
      'The bracket builder lets you design an entirely custom finals structure: choose how many teams qualify, how many weeks are played, and which matchups determine each subsequent game.',
      'Each node in the bracket represents a match. Connect output ports (winner/loser) to input ports of later matches to define the progression path.',
      'Load a preset first to understand the structure, then customise. The builder validates your bracket and will flag errors (e.g., disconnected paths, missing grand final node).',
    ],
  },

  'finals-seeding': {
    title: 'Finals Seeding',
    body: [
      'Finals seeding is determined by ladder position at the end of the regular season. Higher seeds earn home-ground advantage (if enabled) and face lower-seeded opponents in the first week.',
      'In the default page system, finishing 1st or 2nd is a major advantage — a loss in week 1 still gives a second chance, while 1st and 2nd have a double chance.',
    ],
  },

  // -------------------------------------------------------------------------
  // Ladder / Standings
  // -------------------------------------------------------------------------
  'ladder-points': {
    title: 'Ladder Points',
    body: [
      'Clubs earn 4 points for a win, 2 points for a draw, and 0 for a loss.',
      'When clubs are tied on points, percentage (total points scored ÷ total points conceded × 100) is used as the tiebreaker.',
      'A strong percentage can be the difference between playing finals and missing out — running up the score when possible matters.',
    ],
  },

  'ladder-percentage': {
    title: 'Percentage',
    body: [
      'Percentage = (Total Points Scored / Total Points Against) × 100.',
      'Example: 1,200 scored and 1,000 against = 120.0%. Higher is better.',
      'Percentage is the primary tiebreaker when clubs finish on equal premiership points. It can decide finals eligibility in a congested 8th-place battle.',
    ],
  },

  // -------------------------------------------------------------------------
  // State Leagues
  // -------------------------------------------------------------------------
  'state-league': {
    title: 'State League Contracts',
    body: [
      'State leagues (VFL, SANFL, WAFL, NEAFL, etc.) give developing players competitive football below AFL level.',
      'You can nominate players for state league contracts, allowing them to train and play for an affiliate club while remaining on your AFL list.',
      'State league games count toward player development and form. Players in good state-league form may be elevated to the AFL side.',
    ],
  },

  // -------------------------------------------------------------------------
  // Lineup
  // -------------------------------------------------------------------------
  'lineup-positions': {
    title: 'Position Rules',
    body: [
      'Each of the 22 match-day positions has a position line (DEF, MID, FWD, RK). Players are primarily eligible for their natural position but may have secondary eligibility for adjacent lines.',
      'Playing a player well outside their natural position incurs a role-fit penalty to their effective match rating. The slot-fit view on the Lineup screen shows colour-coded suitability.',
      '4 interchange bench spots plus an optional medical substitute (yellow vest) round out the 22+1 squad.',
    ],
  },

  'lineup-autofill': {
    title: 'Autofill Presets',
    body: [
      '• Best Available: Selects the highest-rated eligible player for each slot, balancing form and fitness.',
      '• Last Game Lineup: Replicates the previous match selection, swapping out unavailable players.',
      '• Youth Focus: Prioritises younger squad members to maximise development opportunities.',
      '• Win-Now: Selects purely for peak match performance, ignoring development or continuity goals.',
      'Custom presets let you blend these strategies with a continuity bias slider.',
    ],
  },

  'lineup-interchange': {
    title: 'Interchange & Substitute',
    body: [
      'AFL teams carry 4 interchange players who rotate freely throughout the match. There is no limit on how often a player can cycle on and off.',
      'One optional substitute (yellow vest) can permanently replace an injured or underperforming player during the game. Once used, the substituted player cannot return.',
      'The number of interchange players is configurable in Game Settings → Match Rules.',
    ],
  },

  // -------------------------------------------------------------------------
  // Contracts
  // -------------------------------------------------------------------------
  'contract-structure': {
    title: 'Contract Structure',
    body: [
      'Contracts have a length (1–5 years), an annual value, and optional year-by-year salary variation.',
      'AAV (Average Annual Value) is used for cap calculation purposes. A deal paying $500k in year 1 and $700k in year 2 has an AAV of $600k.',
      'Multi-year contracts lock in cap space beyond this season. Consider future cap implications before offering long-term deals.',
    ],
  },

  'contract-incentives': {
    title: 'Contract Incentives & Clauses',
    body: [
      'You can attach performance incentives to contracts: Brownlow votes, goal tallies, All-Australian selection, finals appearances, etc.',
      'Some clauses increase a player\'s salary if triggered (escalators) while others reduce it (de-escalators).',
      'Player loyalty and market value affect negotiation outcomes — highly sought-after players command premium terms.',
    ],
  },

  // -------------------------------------------------------------------------
  // Trades
  // -------------------------------------------------------------------------
  'trade-mechanics': {
    title: 'Trade Mechanics',
    body: [
      'Trades can involve players, draft picks, or combinations of both. All trades must be accepted by both clubs and must satisfy each club\'s salary cap after the exchange.',
      'The trade evaluator grades deals as Fair, Slight Advantage, or Lopsided based on estimated player/pick values.',
      'Player demand level affects how willing a club is to trade: a player who has requested a trade will be easier to acquire, but their club will demand premium compensation.',
    ],
    learnMorePath: '/trades',
    learnMoreLabel: 'Go to Trades',
  },

  'trade-block': {
    title: 'Trade Block',
    body: [
      'The trade block is a public listing of players your club is willing to trade. Listing a player signals to AI clubs that you are open to offers.',
      'AI clubs periodically browse the trade block and may approach you with offers. You can negotiate, counter, or decline.',
      'Listing a player does not obligate you to accept any offer — you retain full control over final approval.',
    ],
  },

  // -------------------------------------------------------------------------
  // Tribunal
  // -------------------------------------------------------------------------
  'tribunal': {
    title: 'Tribunal System',
    body: [
      'Players reported during a match for dangerous or illegal acts face a tribunal hearing. The MRP (Match Review Panel) assesses the incident and recommends a penalty.',
      'Players can accept the ban directly (saving legal costs) or contest at the tribunal — where a not-guilty verdict clears them but a guilty verdict may increase the penalty.',
      'Prior offences, contact classification, and legal representation all influence the outcome.',
    ],
  },

  // -------------------------------------------------------------------------
  // Training
  // -------------------------------------------------------------------------
  'training': {
    title: 'Training System',
    body: [
      'Weekly training sessions are divided into morning and afternoon slots across training days. You assign activities from categories like Physical, Tactical, Possession, and Set Pieces.',
      'Individual player training focus can be set to target specific attributes — great for developing young players or rounding out gaps in a veteran\'s game.',
      'Overtraining increases injury risk. Balance high-intensity sessions with recovery days, especially during the season.',
    ],
  },

  // -------------------------------------------------------------------------
  // Board & Facilities
  // -------------------------------------------------------------------------
  'board-approval': {
    title: 'Board Approval',
    body: [
      'Major expenditures — stadium upgrades, training complex improvements, academy investments — require board approval.',
      'Approval probability depends on board satisfaction, club finances, and the magnitude of the request. Improving club performance and finances increases board support.',
      'Failed proposals have a cooldown before you can re-apply. Successful upgrades provide persistent bonuses to training, recruiting, or fan engagement.',
    ],
  },

} satisfies Record<string, HelpEntry>

export type HelpTopicKey = keyof typeof HELP_CONTENT

import { useRef } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { FinalsSettings } from '@/types/game'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCapShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  return `$${n.toLocaleString()}`
}

const FINALS_FORMAT_LABELS: Record<string, string> = {
  'afl-top-8': 'the AFL Finals System (Top 8 Double-Chance)',
  'page-mcintyre-top-4': 'the Page–McIntyre Finals System (Top 4)',
  'top-6': 'the Top 6 Finals System',
  'straight-knockout': 'a straight single-elimination knockout format',
  'round-robin': 'a round-robin final series',
  'custom': 'a custom finals format as specified by AFL House',
}

function grandFinalVenueDesc(finals: FinalsSettings): string {
  switch (finals.grandFinalVenueMode) {
    case 'fixed': return `${finals.grandFinalVenue}, which is the designated host venue`
    case 'random': return 'a neutral venue determined by ballot prior to the finals series'
    case 'top-club': return 'the home ground of the highest-seeded Grand Finalist'
  }
}

function injuryFreqDesc(freq: string): string {
  switch (freq) {
    case 'low': return 'reduced — injury incidence is below standard AFL levels'
    case 'medium': return 'realistic — injury incidence reflects standard AFL competition levels'
    case 'high': return 'elevated — injury incidence is above standard AFL levels'
    default: return freq
  }
}

function devSpeedDesc(speed: string): string {
  switch (speed) {
    case 'slow': return 'reduced — players develop below the typical AFL rate'
    case 'normal': return 'standard — players develop at a rate consistent with the AFL norm'
    case 'fast': return 'accelerated — players develop more rapidly than the standard AFL rate'
    default: return speed
  }
}

function difficultyDesc(diff: string): string {
  switch (diff) {
    case 'easy': return 'Rookie Coach — AI clubs are less aggressive in roster and tactical decision-making'
    case 'medium': return 'Club Coach — AI clubs operate at standard competence'
    case 'hard': return 'Senior Coach — AI clubs are highly optimised and ruthless in decision-making'
    case 'custom': return 'Custom — difficulty parameters are set individually'
    default: return diff
  }
}

// Standard AFL reference values for deviation markers
const STD = {
  interchangePlayers: 5,
  quartersPerMatch: 4,
  pointsPerGoal: 6,
  pointsPerBehind: 1,
  regularSeasonRounds: 23,
  finalsQualifyingTeams: 8,
  finalsFormat: 'afl-top-8' as const,
  seniorListSize: 38,
  rookieListSize: 6,
  pointsForWin: 4,
  pointsForDraw: 2,
  pointsForLoss: 0,
}

// ---------------------------------------------------------------------------
// Primitive display components
// ---------------------------------------------------------------------------

function Mod({ show = true }: { show?: boolean }) {
  if (!show) return null
  return (
    <Badge
      variant="outline"
      className="ml-1.5 text-[10px] py-0 px-1 leading-4 border-amber-400 text-amber-600 dark:text-amber-400 align-middle"
    >
      ★ Modified
    </Badge>
  )
}

function Val({
  children,
  mod = false,
}: {
  children: React.ReactNode
  mod?: boolean
}) {
  return (
    <strong
      className={cn(
        'font-semibold',
        mod ? 'text-amber-600 dark:text-amber-400' : '',
      )}
    >
      {children}
    </strong>
  )
}

function Sup({ children }: { children: React.ReactNode }) {
  return (
    <span className="italic text-muted-foreground text-[13px]">
      {children}
    </span>
  )
}

function Clause({
  num,
  children,
}: {
  num: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3 py-[5px] group">
      <span className="text-muted-foreground/60 font-mono text-[11px] shrink-0 w-9 pt-0.5 select-none text-right">
        {num}
      </span>
      <p className="text-sm leading-relaxed text-foreground/90">{children}</p>
    </div>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-5 mb-1 ml-12">
      {children}
    </p>
  )
}

interface SectionProps {
  id: string
  part: string
  title: string
  children: React.ReactNode
}

function Section({ id, part, title, children }: SectionProps) {
  return (
    <section id={id} className="mb-12 scroll-mt-6">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground shrink-0">
          Part {part}
        </span>
        <h2 className="text-base font-bold uppercase tracking-wide">{title}</h2>
      </div>
      <Separator className="mb-3" />
      <div>{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// TOC
// ---------------------------------------------------------------------------

const TOC_ITEMS = [
  { id: 'administration', part: 'I', label: 'Administration' },
  { id: 'match-rules', part: 'II', label: 'Match Rules' },
  { id: 'season-structure', part: 'III', label: 'Season Structure' },
  { id: 'finals', part: 'IV', label: 'Finals Series' },
  { id: 'player-lists', part: 'V', label: 'Player Lists & Contracts' },
  { id: 'salary-cap', part: 'VI', label: 'Salary Cap' },
  { id: 'draft', part: 'VII', label: 'Draft & Academy' },
  { id: 'trades', part: 'VIII', label: 'Trades & Free Agency' },
  { id: 'welfare', part: 'IX', label: 'Player Welfare' },
  { id: 'development', part: 'X', label: 'Player Development' },
  { id: 'discipline', part: 'XI', label: 'Discipline & Tribunal' },
  { id: 'awards', part: 'XII', label: 'Awards' },
  { id: 'afl-house', part: 'XIII', label: 'AFL House Powers' },
]

function TableOfContents({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  function scrollTo(id: string) {
    const el = containerRef.current?.querySelector(`#${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className="w-52 shrink-0 sticky top-0 max-h-screen overflow-y-auto pt-1 pb-8 pr-2 hidden lg:block">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 px-2">
        Contents
      </p>
      {TOC_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollTo(item.id)}
          className="flex items-start gap-2 w-full px-2 py-1 rounded text-left text-xs hover:bg-accent transition-colors"
        >
          <span className="text-muted-foreground font-mono shrink-0 w-5 text-right pt-px">
            {item.part}.
          </span>
          <span className="text-muted-foreground hover:text-foreground transition-colors leading-tight">
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function RulesPage() {
  const settings = useGameStore((s) => s.settings)
  const clubs = useGameStore((s) => s.clubs)
  const currentYear = useGameStore((s) => s.currentYear)
  const containerRef = useRef<HTMLDivElement>(null)

  const clubCount = Object.keys(clubs).length
  const { matchRules, seasonStructure, ladderPoints, listRules, finals, realism } = settings

  const capModified = !settings.salaryCap || settings.salaryCapAmount !== 13_400_000

  return (
    <div className="flex gap-6 h-full">
      <TableOfContents containerRef={containerRef} />

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto pb-16"
      >
        {/* Document header */}
        <div className="mb-10 pb-6 border-b">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Australian Football League
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Competition Rules</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Season {currentYear} — Governing all AFL Competition matches, player
            registrations, and club operations
          </p>
          <p className="text-xs text-muted-foreground/70 mt-3 italic max-w-2xl">
            These Competition Rules govern the conduct of all football played within
            the AFL Competition and are binding on all Member Clubs, their officials,
            players, coaching staff, and contracted personnel. Rules are updated to
            reflect the settings of this competition. Clauses that deviate from
            standard AFL rules are marked <span className="not-italic font-semibold text-amber-600 dark:text-amber-400">★ Modified</span>.
          </p>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Part I — Administration */}
        {/* ------------------------------------------------------------------ */}
        <Section id="administration" part="I" title="Administration">
          <Clause num="1.1">
            The competition shall be known as the <Val>Australian Football League</Val>{' '}
            (AFL), comprising <Val mod={clubCount !== 18}>{clubCount} Member Club{clubCount !== 1 ? 's' : ''}</Val>
            <Mod show={clubCount !== 18} />.
          </Clause>
          <Clause num="1.2">
            The competition is governed by the <Val>AFL Commission</Val> (AFL House),
            whose decisions on competition structure, player movement, and operational
            matters are final and binding on all Member Clubs.
          </Clause>
          <Clause num="1.3">
            The competition difficulty level is set to{' '}
            <Val mod={settings.difficulty !== 'medium'}>
              {settings.difficulty.charAt(0).toUpperCase() + settings.difficulty.slice(1)}
            </Val>
            <Mod show={settings.difficulty !== 'medium'} /> — {difficultyDesc(settings.difficulty)}.
          </Clause>
          <Clause num="1.4">
            This competition is conducted under{' '}
            <Val>
              {settings.leagueMode === 'real'
                ? 'real-world AFL branding and club identities'
                : settings.leagueMode === 'fictional'
                ? 'a fully fictional league identity'
                : 'a custom league configuration'}
            </Val>.
          </Clause>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part II — Match Rules */}
        {/* ------------------------------------------------------------------ */}
        <Section id="match-rules" part="II" title="Match Rules">
          <SubHeading>Structure of Play</SubHeading>
          <Clause num="2.1">
            A match is played between two teams of <Val>18 players</Val> on the field
            at any one time, with each team permitted{' '}
            <Val mod={matchRules.interchangePlayers !== STD.interchangePlayers}>
              {matchRules.interchangePlayers} interchange player
              {matchRules.interchangePlayers !== 1 ? 's' : ''}
            </Val>{' '}
            on the bench
            <Mod show={matchRules.interchangePlayers !== STD.interchangePlayers} />. The
            total playing roster selected for each match is therefore{' '}
            <Val mod={matchRules.interchangePlayers !== STD.interchangePlayers}>
              {18 + matchRules.interchangePlayers} players
            </Val>.
          </Clause>
          <Clause num="2.2">
            {matchRules.enableSubstitutes ? (
              <>
                Each team is permitted to use <Val>one tactical substitute</Val> per
                match. The substitute may replace any field or interchange player and
                may not be re-introduced once substituted.
              </>
            ) : (
              <>
                <Val>Tactical substitutes are not in operation</Val> for this
                competition. All interchange players are available for unlimited
                rotation throughout the match.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          <Clause num="2.3">
            A match is divided into{' '}
            <Val mod={matchRules.quartersPerMatch !== STD.quartersPerMatch}>
              {matchRules.quartersPerMatch} quarter{matchRules.quartersPerMatch !== 1 ? 's' : ''}
            </Val>
            <Mod show={matchRules.quartersPerMatch !== STD.quartersPerMatch} />.{' '}
            {matchRules.quartersPerMatch !== 4 && (
              <Sup>
                The standard AFL match consists of four quarters; this competition
                deviates from that standard.{' '}
              </Sup>
            )}
            Time-on is added at the discretion of the field umpire.
          </Clause>

          <SubHeading>Scoring</SubHeading>
          <Clause num="2.4">
            A <Val>goal</Val> is scored when the ball is kicked through the two
            centre goal posts by an attacking player without being touched by another
            player. A goal is worth{' '}
            <Val mod={matchRules.pointsPerGoal !== STD.pointsPerGoal}>
              {matchRules.pointsPerGoal} point{matchRules.pointsPerGoal !== 1 ? 's' : ''}
            </Val>
            <Mod show={matchRules.pointsPerGoal !== STD.pointsPerGoal} />.
          </Clause>
          <Clause num="2.5">
            A <Val>behind</Val> is scored by all other means of scoring, including
            the ball passing through the outer goal posts (a point), the ball being
            touched prior to passing through the centre posts, or the ball hitting
            the post. A behind is worth{' '}
            <Val mod={matchRules.pointsPerBehind !== STD.pointsPerBehind}>
              {matchRules.pointsPerBehind} point{matchRules.pointsPerBehind !== 1 ? 's' : ''}
            </Val>
            <Mod show={matchRules.pointsPerBehind !== STD.pointsPerBehind} />.
          </Clause>
          <Clause num="2.6">
            The team with the higher aggregate score at the expiry of the final
            quarter is declared the winner. In the event of equal scores at the
            expiry of time, the match is declared a draw, except in finals matches
            where extra time provisions apply.
          </Clause>

          <SubHeading>Field Umpires</SubHeading>
          <Clause num="2.7">
            Each match is controlled by <Val>three field umpires</Val>, two boundary
            umpires, and two goal umpires. The field umpires' decisions on the field
            of play are final. Field umpires record <Val>3-2-1 votes</Val> after each
            match for the Brownlow Medal.
          </Clause>

          {realism.tacticalInjuryConsequences && (
            <Clause num="2.8">
              <Val>Tactical injury consequences are in operation.</Val> Coaching
              instructions that direct players to physically target specific
              opponents carry an elevated risk of incurring injuries and tribunal
              charges upon the instigating players.
            </Clause>
          )}
          {realism.tacticalSuspensionConsequences && (
            <Clause num={realism.tacticalInjuryConsequences ? '2.9' : '2.8'}>
              <Val>Tactical suspension consequences are in operation.</Val> Coaching
              instructions to use physical force against specific opponents increase
              exposure to suspension under the Match Review system.
            </Clause>
          )}
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part III — Season Structure */}
        {/* ------------------------------------------------------------------ */}
        <Section id="season-structure" part="III" title="Season Structure">
          <SubHeading>Home-and-Away Season</SubHeading>
          <Clause num="3.1">
            The regular season comprises{' '}
            <Val mod={seasonStructure.regularSeasonRounds !== STD.regularSeasonRounds}>
              {seasonStructure.regularSeasonRounds} rounds
            </Val>{' '}
            of home-and-away competition
            <Mod show={seasonStructure.regularSeasonRounds !== STD.regularSeasonRounds} />.{' '}
            {seasonStructure.byeRounds && (
              <>
                The draw includes{' '}
                <Val>{seasonStructure.byeRoundCount} bye round{seasonStructure.byeRoundCount !== 1 ? 's' : ''}</Val>{' '}
                during which each club receives a scheduled rest week.
              </>
            )}
            {!seasonStructure.byeRounds && (
              <>
                <Val>No bye rounds</Val> are scheduled; every club plays in
                every round of the regular season.
              </>
            )}
          </Clause>
          <Clause num="3.2">
            The AFL Commission retains the right to schedule selected matches as{' '}
            <Val>blockbuster fixtures</Val> to maximise broadcast audiences and
            community engagement, subject to Clause 13 of these Rules.
          </Clause>

          <SubHeading>Competition Points</SubHeading>
          <Clause num="3.3">
            Competition points are awarded for all home-and-away matches as follows:
            a win is worth{' '}
            <Val mod={ladderPoints.pointsForWin !== STD.pointsForWin}>
              {ladderPoints.pointsForWin} competition point{ladderPoints.pointsForWin !== 1 ? 's' : ''}
            </Val>
            <Mod show={ladderPoints.pointsForWin !== STD.pointsForWin} />; a draw is
            worth{' '}
            <Val mod={ladderPoints.pointsForDraw !== STD.pointsForDraw}>
              {ladderPoints.pointsForDraw} competition point{ladderPoints.pointsForDraw !== 1 ? 's' : ''}
            </Val>
            <Mod show={ladderPoints.pointsForDraw !== STD.pointsForDraw} />; a loss
            is worth{' '}
            <Val mod={ladderPoints.pointsForLoss !== STD.pointsForLoss}>
              {ladderPoints.pointsForLoss} competition point{ladderPoints.pointsForLoss !== 1 ? 's' : ''}
            </Val>
            <Mod show={ladderPoints.pointsForLoss !== STD.pointsForLoss} />.
          </Clause>
          <Clause num="3.4">
            At the conclusion of the regular season, clubs are ranked on the{' '}
            <Val>Premiership Ladder</Val> in descending order of competition points
            accumulated, with percentage (points scored divided by points conceded,
            multiplied by 100) as the primary tiebreaker.
          </Clause>
          <Clause num="3.5">
            Competition points are not awarded in finals matches. Finals matches are
            decided solely by the score at the expiry of regulation time (with extra
            time provisions where applicable).
          </Clause>

          <SubHeading>Scheduling</SubHeading>
          <Clause num="3.6">
            {realism.fixtureBlockbusterBias ? (
              <>
                <Val>Fixture blockbuster bias is in operation.</Val> Designated
                marquee matches — including ANZAC Day, Queen's Birthday, and other
                named fixtures — receive priority scheduling in prime broadcast
                timeslots.
              </>
            ) : (
              <>
                Fixture scheduling is conducted on a neutral basis. Named fixtures
                receive no scheduling priority over other matches in this competition.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          <Clause num="3.7">
            {realism.fixtureRivalryScheduling ? (
              <>
                <Val>Traditional rivalry scheduling is enforced.</Val> The AFL
                Commission guarantees that traditional rivalry pairs play each other
                at least twice per home-and-away season.
              </>
            ) : (
              <>
                Traditional rivalry scheduling is <Val>not enforced</Val>. Fixture
                construction follows standard home-and-away balance principles only.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          <Clause num="3.8">
            {realism.venueScheduling ? (
              <>
                <Val>Dynamic venue allocation is in operation.</Val> Shared venues
                are subject to scheduling negotiations, and clubs may be required to
                play nominally home matches at alternative venues. Home ground
                advantage ratings are applied dynamically based on crowd composition
                and familiarity.
              </>
            ) : (
              <>
                Venue allocation is <Val>fixed</Val>. Each club plays all home
                matches at its designated home ground without venue-sharing
                constraints.{' '}
                <Mod show />
              </>
            )}
          </Clause>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part IV — Finals Series */}
        {/* ------------------------------------------------------------------ */}
        <Section id="finals" part="IV" title="Finals Series">
          <Clause num="4.1">
            The top{' '}
            <Val mod={finals.finalsQualifyingTeams !== STD.finalsQualifyingTeams}>
              {finals.finalsQualifyingTeams} clubs
            </Val>
            <Mod show={finals.finalsQualifyingTeams !== STD.finalsQualifyingTeams} />{' '}
            on the Premiership Ladder at the conclusion of the regular season qualify
            for the finals series.
          </Clause>
          <Clause num="4.2">
            The finals series shall be conducted under{' '}
            <Val mod={finals.finalsFormat !== STD.finalsFormat}>
              {FINALS_FORMAT_LABELS[finals.finalsFormat] ?? finals.finalsFormat}
            </Val>
            <Mod show={finals.finalsFormat !== STD.finalsFormat} />.
          </Clause>
          <Clause num="4.3">
            The <Val>AFL Grand Final</Val> shall be played at{' '}
            <Val mod={finals.grandFinalVenueMode !== 'fixed' || finals.grandFinalVenue !== 'MCG'}>
              {grandFinalVenueDesc(finals)}
            </Val>
            <Mod show={finals.grandFinalVenueMode !== 'fixed' || finals.grandFinalVenue !== 'MCG'} />.
          </Clause>
          <Clause num="4.4">
            The winner of the Grand Final is awarded the{' '}
            <Val>AFL Premiership Cup</Val> and shall be declared the Premiers for
            the season. The Premiership is recorded permanently in the Club's history.
          </Clause>
          <Clause num="4.5">
            In all finals matches (except the Grand Final), a drawn match shall be
            decided by extra time played in additional quarters until a winner is
            determined. The Grand Final may be replayed at the Commission's
            discretion if drawn after extra time.
          </Clause>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part V — Player Lists & Contracts */}
        {/* ------------------------------------------------------------------ */}
        <Section id="player-lists" part="V" title="Player Lists & Contracts">
          <SubHeading>List Sizes</SubHeading>
          <Clause num="5.1">
            Each Member Club shall maintain a{' '}
            <Val mod={listRules.seniorListSize !== STD.seniorListSize}>
              Senior List of {listRules.seniorListSize} players
            </Val>
            <Mod show={listRules.seniorListSize !== STD.seniorListSize} /> and a{' '}
            <Val mod={listRules.rookieListSize !== STD.rookieListSize}>
              Supplemental/Rookie List of up to {listRules.rookieListSize} players
            </Val>
            <Mod show={listRules.rookieListSize !== STD.rookieListSize} />.
          </Clause>
          <Clause num="5.2">
            {realism.listSizeEnforcement ? (
              <>
                <Val>List size limits are strictly enforced.</Val> A club may not
                register more than the permitted number of players on either the
                Senior List or the Supplemental List at any time. A club that
                exceeds list limits must delist a player before registering a
                replacement.
              </>
            ) : (
              <>
                List size limits are <Val>advisory only</Val> and are not strictly
                enforced for this competition. Clubs may exceed list limits without
                incurring a penalty.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          <Clause num="5.3">
            Only players on a club's registered Senior List or Supplemental List are
            eligible to play in AFL competition matches. A player's list status must
            be confirmed by the Club no later than the selection deadline prior to
            each round.
          </Clause>

          <SubHeading>Player Contracts</SubHeading>
          <Clause num="5.4">
            All players must hold a valid contract with a Member Club to participate
            in the competition. Contracts specify an annual value and a term
            expressed in seasons. All contract values count toward the club's
            Salary Cap allocation as defined in Part VI.
          </Clause>
          <Clause num="5.5">
            {realism.playerLoyalty ? (
              <>
                <Val>Player loyalty provisions are in force.</Val> Long-serving
                players may accept contract terms at a discount to market value in
                recognition of their loyalty to the Club. Loyal players may also
                exercise resistance to trades to clubs where they have no wish to
                play, consistent with Clause 8 of these Rules.
              </>
            ) : (
              <>
                Player loyalty provisions are <Val>not in operation</Val>. All
                player negotiations are conducted on purely commercial terms without
                loyalty discounts or resistance provisions.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          <Clause num="5.6">
            {realism.mediaLeaks ? (
              <>
                <Val>Media leak provisions apply.</Val> Player managers may brief
                the media during contract negotiations, creating public pressure on
                clubs. Leaked information may affect rival clubs' negotiating
                positions and affect the player's trade value.
              </>
            ) : (
              <>
                Media leak provisions are <Val>suspended</Val>. All player
                contract negotiations are conducted in strict confidence without
                media involvement.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          <Clause num="5.7">
            {realism.negotiationDelays ? (
              <>
                <Val>Multi-round negotiation delays apply.</Val> Contract
                negotiations proceed over multiple rounds of offer and
                counter-offer, consistent with real-world player agent practice.
              </>
            ) : (
              <>
                Negotiations are resolved <Val>immediately</Val> upon offer.
                Multi-round delays are not simulated for this competition.{' '}
                <Mod show />
              </>
            )}
          </Clause>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part VI — Salary Cap */}
        {/* ------------------------------------------------------------------ */}
        <Section id="salary-cap" part="VI" title="Salary Cap">
          {settings.salaryCap ? (
            <>
              <Clause num="6.1">
                Each Member Club is subject to an annual{' '}
                <Val mod={capModified}>
                  Total Player Payment (TPP) cap of {formatCapShort(settings.salaryCapAmount)}
                </Val>
                <Mod show={capModified} />. The TPP cap applies to all payments made
                or agreed to be made to players on the club's Senior and Supplemental
                Lists combined, whether in cash, benefits, or any other form of
                remuneration.
              </Clause>
              <Clause num="6.2">
                A club whose Total Player Payment at the end of the season exceeds the
                TPP cap shall be deemed to be over the salary cap and subject to
                penalties as determined by the AFL Commission, which may include
                loss of draft picks, fines, or competitive sanctions.
              </Clause>
              {realism.softCapSpending ? (
                <Clause num="6.3">
                  <Val>Soft cap (luxury tax) provisions are in operation.</Val>{' '}
                  Clubs may exceed the TPP cap by making luxury tax payments to the
                  AFL at a rate determined by the Commission for expenditure above
                  the cap threshold. Soft cap spending does not incur direct
                  competitive penalties but may affect the club's financial position.
                </Clause>
              ) : (
                <Clause num="6.3">
                  The TPP cap is a <Val>hard cap</Val>. No soft cap or luxury tax
                  arrangement is available. Clubs may not commit to player payments
                  that would cause their TPP to exceed the cap at any time during
                  the season.
                </Clause>
              )}
              {realism.aflHouseSalaryCapEvolution && (
                <Clause num="6.4">
                  <Val>Salary Cap Evolution is enabled.</Val> AFL House may adjust
                  the TPP cap amount between seasons in line with competition revenue
                  growth or contraction, as determined by the Commission's financial
                  review.
                </Clause>
              )}
              {settings.inflation && (
                <Clause num={realism.aflHouseSalaryCapEvolution ? '6.5' : '6.4'}>
                  <Val>Inflation provisions apply.</Val> Contract values and the TPP
                  cap are subject to annual CPI adjustment, reflecting changes in
                  the cost of living and competition revenue. Clubs should plan
                  contract terms with reference to expected future cap levels.
                </Clause>
              )}
            </>
          ) : (
            <>
              <Clause num="6.1">
                <Val>The Total Player Payment (TPP) cap is suspended</Val> for this
                competition.{' '}
                <Mod show /> Clubs may commit to player payments of any amount
                without restriction. The Commission strongly encourages clubs to
                exercise financial prudence in the absence of regulatory constraints.
              </Clause>
              <Clause num="6.2">
                Notwithstanding the suspension of the TPP cap, all player payments
                are recorded and form part of each club's financial reporting for the
                purposes of league health assessment.
              </Clause>
            </>
          )}
          {realism.salaryDumpTrades && (
            <Clause num="6.5">
              <Val>Salary dump trade provisions apply.</Val> A club may include a
              player on a substantial contract in a trade at below-market value
              ("salary dump") in order to bring its TPP within the cap. The
              receiving club must account for the full contract value. A "dead cap"
              penalty may apply to the sending club at the Commission's discretion.
            </Clause>
          )}
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part VII — Draft & Academy */}
        {/* ------------------------------------------------------------------ */}
        <Section id="draft" part="VII" title="Draft & Academy">
          <SubHeading>National Draft</SubHeading>
          <Clause num="7.1">
            The <Val>AFL National Draft</Val> is conducted annually at the conclusion
            of the trade period. All eligible players (those not already listed with
            a club) who have nominated for the draft are available for selection.
          </Clause>
          <Clause num="7.2">
            Draft selection order is determined by finishing position on the
            Premiership Ladder at the conclusion of the regular season, with the
            lowest-placed club selecting first. Clubs may trade draft picks in
            accordance with Part VIII of these Rules.
          </Clause>
          {realism.aflHouseInterference && (
            <Clause num="7.3">
              <Val>AFL House interference provisions are in force.</Val> AFL House
              may award priority selections to financially distressed or
              long-struggling clubs at its discretion, to assist in rebuilding
              competitiveness across the competition.
            </Clause>
          )}
          <Clause num={realism.aflHouseInterference ? '7.4' : '7.3'}>
            {realism.draftVariance ? (
              <>
                <Val>Draft variance provisions apply.</Val> A player's ultimate
                development trajectory is not guaranteed by their draft position.
                Highly credentialed draft selections may underperform their ranking
                (draft busts), while late-round selections may develop beyond their
                draft position (late bloomers). Clubs should conduct thorough
                scouting before committing high picks.
              </>
            ) : (
              <>
                Draft variance is <Val>not in operation</Val>. All drafted players
                develop in line with their draft position without positive or
                negative deviation.{' '}
                <Mod show />
              </>
            )}
          </Clause>

          <SubHeading>Rookie Draft</SubHeading>
          <Clause num="7.5">
            The <Val>Rookie Draft</Val> is conducted immediately following the
            National Draft. Clubs may select players onto their Supplemental List
            from the pool of eligible undrafted players. Players on the Supplemental
            List are subject to the same TPP provisions as Senior List players.
          </Clause>

          <SubHeading>Academy & Father-Son</SubHeading>
          <Clause num="7.6">
            {realism.ngaAcademy ? (
              <>
                <Val>The Academy and Next Generation Academies (NGA) matching
                system is in operation.</Val> A club with an exclusive
                development arrangement with an Academy or NGA prospect may match
                any bid placed on that player in the National Draft. Matching
                operates on the bid-and-match model as specified by the Commission.
                {realism.ngaAcademyZoneMatching && (
                  <> Academy and NGA matching rights are restricted to zone-linked
                  prospects as defined by the Commission's geographic zoning rules.</>
                )}
              </>
            ) : (
              <>
                The Academy and NGA matching system is <Val>not in operation</Val>.
                All nominated prospects enter the draft pool without club matching
                rights. Clubs may still participate in development academies but
                cannot exercise exclusive rights.{' '}
                <Mod show />
              </>
            )}
          </Clause>

          <SubHeading>Supplemental Selection Period</SubHeading>
          <Clause num="7.7">
            Following the completion of the National Draft and Rookie Draft, the{' '}
            <Val>Supplemental Selection Period (SSP)</Val> is open for clubs to sign
            players from the unsigned pool to fill vacancies on their lists,
            subject to list size limits and TPP compliance.
          </Clause>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part VIII — Trades & Free Agency */}
        {/* ------------------------------------------------------------------ */}
        <Section id="trades" part="VIII" title="Trades & Free Agency">
          <SubHeading>Trade Period</SubHeading>
          <Clause num="8.1">
            The <Val>Trade Period</Val> is conducted following the Grand Final and
            prior to the National Draft. During this period, clubs may trade players,
            draft picks, and future draft selections with other Member Clubs, subject
            to the consent of the players involved and TPP compliance.
          </Clause>
          <Clause num="8.2">
            All trades must be submitted to and approved by the AFL Commission prior
            to taking effect. The Commission may decline to approve any trade that it
            considers contrary to the integrity of the competition.
          </Clause>

          <SubHeading>Player Rights</SubHeading>
          <Clause num="8.3">
            {realism.tradeRequests ? (
              <>
                <Val>Trade request provisions are in force.</Val> A player who is
                dissatisfied at their club may formally request a trade through their
                manager. The request is communicated to the club and, where the
                player opts to exercise this right, the club is obliged to consider
                genuine trade offers from other clubs.
                {realism.nominatedTradeDestinations && (
                  <> Players exercising trade requests may nominate one or more
                  preferred destination clubs.</>
                )}
                {realism.reducedNominatedLeverage && (
                  <> Nominated destination clubs may negotiate at a slight discount
                  to market value, reflecting the player's stated preference.</>
                )}
              </>
            ) : (
              <>
                Player trade request provisions are <Val>not in operation</Val>. All
                player transfers are initiated by clubs. A player cannot formally
                nominate a desired trade destination.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          <Clause num="8.4">
            {realism.playersRefuseTrades ? (
              <>
                <Val>Player trade refusal rights are in force.</Val> A player who
                objects to a proposed trade may refuse the transfer. No club may
                force a player to accept a trade to a club the player has nominated
                as unacceptable. A player who refuses a trade remains on the
                originating club's list for the following season.
              </>
            ) : (
              <>
                Player trade refusal rights are <Val>suspended</Val>. Clubs may
                execute player trades without requiring the express consent of the
                player being traded, provided all other Trade Period rules are
                satisfied.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          {realism.playerRoleDisputes && (
            <Clause num="8.5">
              <Val>Player role dispute provisions apply.</Val> A player who is
              consistently selected in a position materially different from their
              natural or agreed role may experience morale and performance
              consequences, which may increase trade request activity.
            </Clause>
          )}

          <SubHeading>Salary Considerations</SubHeading>
          <Clause num="8.6">
            {realism.salaryDumpTrades ? (
              <>
                <Val>Salary dump arrangements are permitted.</Val> A club that is
                above the TPP cap, or seeking to create cap space, may include a
                player on a high contract value in a trade at below-market exchange
                rates. The receiving club must account for the full contract value
                against its TPP.
              </>
            ) : (
              <>
                Salary dump arrangements are <Val>not permitted</Val>. All trades
                must be conducted at fair exchange value. Clubs may not
                deliberately disadvantage themselves in a trade solely to offload
                salary.{' '}
                <Mod show />
              </>
            )}
          </Clause>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part IX — Player Welfare */}
        {/* ------------------------------------------------------------------ */}
        <Section id="welfare" part="IX" title="Player Welfare">
          <Clause num="9.1">
            The AFL Commission is committed to the health, safety, and welfare of all
            registered players. Member Clubs must ensure that players are not
            selected to play while carrying injuries that pose a material risk of
            aggravation or further harm.
          </Clause>
          <Clause num="9.2">
            Injury incidence in this competition is set to{' '}
            <Val mod={settings.injuryFrequency !== 'medium'}>
              {settings.injuryFrequency}
            </Val>
            <Mod show={settings.injuryFrequency !== 'medium'} /> —{' '}
            {injuryFreqDesc(settings.injuryFrequency)}.
          </Clause>
          <Clause num="9.3">
            Players sustaining injuries during matches or training shall receive
            appropriate medical attention as directed by the club's medical and
            sports science staff. Recovery timelines are determined by injury
            severity and the quality of the club's medical facilities.
          </Clause>
          <Clause num="9.4">
            Practice matches and intra-squad trials are conducted at reduced
            intensity. Injury risk in practice matches is approximately{' '}
            <Val>40% of regular season match intensity</Val> to reflect the
            controlled environment of pre-season preparation.
          </Clause>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part X — Player Development */}
        {/* ------------------------------------------------------------------ */}
        <Section id="development" part="X" title="Player Development">
          <Clause num="10.1">
            Player development operates at{' '}
            <Val mod={settings.developmentSpeed !== 'normal'}>
              {settings.developmentSpeed} speed
            </Val>
            <Mod show={settings.developmentSpeed !== 'normal'} /> —{' '}
            {devSpeedDesc(settings.developmentSpeed)}.
          </Clause>
          <Clause num="10.2">
            Development rates are influenced by a player's age, natural attributes,
            coaching quality, training sessions attended, and the quality of the
            club's facilities (training ground, gym, medical centre, recovery pool,
            and analysis suite). Clubs investing in superior infrastructure will see
            a measurable improvement in player development outcomes.
          </Clause>
          <Clause num="10.3">
            Players aged between 18 and their early-to-mid twenties are typically in
            their primary development window. Players above the age of 28 may begin
            to experience gradual decline in physical attributes, though tactical and
            skill-based attributes may continue to develop with experience.
          </Clause>
          <Clause num="10.4">
            {realism.draftVariance ? (
              <>
                In accordance with Clause 7 of these Rules, individual development
                trajectories include variance. Some players will develop faster or
                slower than their rated potential would indicate.
              </>
            ) : (
              <>
                Development follows predictable trajectories without variance. A
                player's development ceiling is determined by their rated potential
                and will be achieved barring injury or premature retirement.
              </>
            )}
          </Clause>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part XI — Discipline & Tribunal */}
        {/* ------------------------------------------------------------------ */}
        <Section id="discipline" part="XI" title="Discipline & Tribunal">
          <Clause num="11.1">
            The <Val>Match Review Officer (MRO)</Val> reviews reportable incidents
            from each round of competition and may charge players with conduct
            offences including careless, reckless, or intentional contact, and
            various acts of misconduct as defined by the Laws of Australian Football.
          </Clause>
          <Clause num="11.2">
            Charged players may accept the MRO's determination and serve the
            prescribed suspension, or contest the charge before the{' '}
            <Val>AFL Tribunal</Val>, which functions as an independent judicial body.
          </Clause>
          <Clause num="11.3">
            {realism.tribunalEarlyPleaDiscount ? (
              <>
                <Val>Early guilty plea discounts apply.</Val> A player who accepts
                the MRO charge and enters a guilty plea prior to the Tribunal
                hearing is entitled to a one-week reduction in any suspension
                imposed, subject to the minimum penalties for the relevant offence.
              </>
            ) : (
              <>
                Early guilty plea discounts are <Val>not available</Val> in this
                competition. Players who accept MRO charges serve the full
                prescribed penalty.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          <Clause num="11.4">
            {realism.tribunalLegalRepresentation ? (
              <>
                <Val>Legal representation is permitted.</Val> Players contesting
                charges at Tribunal may engage external legal counsel to represent
                them. The quality of legal representation may affect the probability
                of a successful outcome.
              </>
            ) : (
              <>
                Legal representation is <Val>not permitted</Val>. Players must
                represent themselves or be represented by club officials at Tribunal
                hearings.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          <Clause num="11.5">
            {realism.tribunalPriorRecord ? (
              <>
                <Val>Prior disciplinary record is taken into account.</Val> The
                Tribunal will consider a player's history of offences when
                determining penalties. A player with a significant prior record of
                misconduct may receive an increased suspension for a subsequent
                offence of equal severity.
              </>
            ) : (
              <>
                Prior disciplinary record has <Val>no bearing</Val> on Tribunal
                outcomes in this competition. Each charge is assessed on its
                individual merits only.{' '}
                <Mod show />
              </>
            )}
          </Clause>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part XII — Awards */}
        {/* ------------------------------------------------------------------ */}
        <Section id="awards" part="XII" title="Awards & Recognition">
          <SubHeading>Brownlow Medal</SubHeading>
          <Clause num="12.1">
            The <Val>Brownlow Medal</Val> is awarded annually to the player judged
            by the field umpires to be the fairest and most brilliant player in the
            home-and-away season. Field umpires cast <Val>3-2-1 votes</Val> after
            each round for the best players on the ground. The player with the
            highest aggregate vote total at the conclusion of the season is awarded
            the medal. In the event of a tie, all equal vote-getters are recognised
            as joint winners.
          </Clause>
          <Clause num="12.2">
            Suspended players are ineligible to receive Brownlow votes for rounds in
            which they did not play. Players serving suspension remain on the
            leaderboard for other rounds.
          </Clause>
          <Clause num="12.3">
            {realism.brownlowNight ? (
              <>
                <Val>Brownlow Night confidentiality provisions are in effect.</Val>{' '}
                All Brownlow votes are sealed and kept confidential from the
                conclusion of the regular season until the official Brownlow Night
                ceremony, conducted on the Monday evening before the Grand Final.
                Vote counts are revealed round-by-round during the live ceremony.
              </>
            ) : (
              <>
                Brownlow votes are <Val>published immediately</Val> following each
                round of the regular season. There is no sealed-vote ceremony. The
                leaderboard is updated in real time throughout the season.{' '}
                <Mod show />
              </>
            )}
          </Clause>

          <SubHeading>Coleman Medal</SubHeading>
          <Clause num="12.4">
            The <Val>Coleman Medal</Val> is awarded annually to the leading
            goalkicker of the home-and-away season. The medal is awarded to the
            player who has kicked the highest number of goals across all
            home-and-away rounds. In the event of a tie, the medal is shared.
          </Clause>

          <SubHeading>Other Awards</SubHeading>
          <Clause num="12.5">
            The <Val>All-Australian Team</Val> is selected at the conclusion of the
            regular season by a panel appointed by the Commission. Selection to the
            All-Australian squad and team is based on season-long performance
            across all home-and-away matches.
          </Clause>
          <Clause num="12.6">
            Each Member Club administers its own <Val>Best and Fairest</Val> award,
            with votes recorded by coaching staff or club officials after each round.
            Club Best and Fairest awards are independent of the Brownlow Medal
            adjudication process.
          </Clause>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Part XIII — AFL House Powers */}
        {/* ------------------------------------------------------------------ */}
        <Section id="afl-house" part="XIII" title="AFL House Powers">
          <SubHeading>Competition Integrity</SubHeading>
          <Clause num="13.1">
            The AFL Commission retains plenary power to protect the integrity and
            financial health of the competition. The Commission may at any time
            direct a Member Club to take remedial action with respect to its
            finances, list management, or governance.
          </Clause>

          <SubHeading>Expansion, Contraction & Relocation</SubHeading>
          <Clause num="13.2">
            {realism.aflHouseExpansionEvolution ? (
              <>
                <Val>AFL House expansion and evolution powers are in effect.</Val>{' '}
                The Commission may, at the conclusion of any season and subject to
                a review of competition health indicators, exercise the following
                powers:
                <br /><br />
                <span className="ml-4 block space-y-1">
                  <span className="block"><strong>(a) Expansion</strong> — admit one or more new Member Clubs from eligible markets, provided that the competition's aggregate financial health meets the expansion threshold.</span>
                  <span className="block"><strong>(b) Contraction</strong> — fold a financially distressed and consistently poor-performing Member Club, with all listed players dispersed to the unsigned pool.</span>
                  <span className="block"><strong>(c) Relocation</strong> — direct a small-market, loss-making club to relocate to an alternative city and rebrand accordingly.</span>
                  <span className="block"><strong>(d) Merger</strong> — broker a merger between two financially distressed clubs, with the surviving entity absorbing the best available players from the dissolved club up to the list size limit, and the remainder entering the unsigned pool.</span>
                </span>
                <br />
                These powers may be exercised concurrently. Multiple events may
                occur in a single offseason. There is no minimum club count beyond
                the practical floor of <Val>2 clubs</Val> required to conduct a
                competition. The player's own club may be subject to any of the
                above actions.
              </>
            ) : (
              <>
                <Val>AFL House expansion and evolution powers are suspended</Val>{' '}
                for this competition.{' '}
                <Mod show /> The composition of the competition is fixed at{' '}
                <Val>{clubCount} Member Club{clubCount !== 1 ? 's' : ''}</Val>. The
                Commission will not exercise powers of expansion, contraction,
                relocation, or merger during the currency of this save.
              </>
            )}
          </Clause>

          <SubHeading>Competition Structure Evolution</SubHeading>
          <Clause num="13.3">
            {realism.aflHouseCompetitionEvolution ? (
              <>
                <Val>Competition structure evolution powers are in effect.</Val> The
                Commission may, between seasons, alter the competition structure —
                including the introduction or removal of conferences, divisions, or
                alternative competition models — as it determines appropriate for the
                long-term health of the competition.
              </>
            ) : (
              <>
                Competition structure evolution powers are <Val>suspended</Val>. The
                competition will be conducted under a single table, home-and-away
                format for the duration of this save.{' '}
                <Mod show />
              </>
            )}
          </Clause>

          <Clause num="13.4">
            {realism.aflHouseFinalsEvolution ? (
              <>
                <Val>Finals format evolution powers are in effect.</Val> The
                Commission may modify the finals format between seasons if it
                determines that the current structure no longer serves the
                competition's best interests.
              </>
            ) : (
              <>
                The finals format is <Val>fixed</Val> for this competition and will
                not be altered by AFL House.{' '}
                <Mod show={finals.finalsFormat !== STD.finalsFormat} />
              </>
            )}
          </Clause>

          <Clause num="13.5">
            {realism.aflHouseListRulesEvolution ? (
              <>
                <Val>List rules evolution powers are in effect.</Val> The Commission
                may adjust Senior List and Supplemental List sizes between seasons
                in response to changes in competition scale and player welfare
                considerations.
              </>
            ) : (
              <>
                List size rules are <Val>fixed</Val> for this competition. AFL House
                will not adjust Senior or Supplemental List sizes.{' '}
                <Mod show={listRules.seniorListSize !== STD.seniorListSize || listRules.rookieListSize !== STD.rookieListSize} />
              </>
            )}
          </Clause>

          <Clause num="13.6">
            {realism.aflHouseFixtureEvolution ? (
              <>
                <Val>Fixture and season-structure evolution powers are in effect.</Val>{' '}
                The Commission may alter the number of regular season rounds, the
                bye round structure, or fixture scheduling policy between seasons.
              </>
            ) : (
              <>
                Season structure is <Val>fixed</Val>. The Commission will not alter
                the number of rounds or bye round structure during this competition.{' '}
                <Mod show={seasonStructure.regularSeasonRounds !== STD.regularSeasonRounds} />
              </>
            )}
          </Clause>

          <SubHeading>Board & Coaching</SubHeading>
          <Clause num="13.7">
            {realism.boardPressure ? (
              <>
                <Val>Board pressure provisions are in effect.</Val> Member Club
                boards set annual performance expectations for head coaches. A coach
                who fails to meet board expectations is at risk of losing their
                position. Job security is tracked throughout the season and may be
                affected by results, transactions, and external events.
                {realism.boardPolitics && (
                  <> <Val>Board political factions</Val> are in operation.
                  Internal factional dynamics within club boards may amplify or
                  moderate the pressure applied to coaching staff, independent of
                  on-field results.</>
                )}
              </>
            ) : (
              <>
                Board pressure provisions are <Val>suspended</Val>. Coaching
                positions are secure regardless of results, and no job security
                mechanics are applied.{' '}
                <Mod show />
              </>
            )}
          </Clause>
          <Clause num="13.8">
            {realism.coachingCarousel ? (
              <>
                <Val>The coaching carousel is in effect.</Val> AI Member Clubs will
                dismiss under-performing head coaches and appoint replacements,
                consistent with real-world AFL coaching turnover patterns.
              </>
            ) : (
              <>
                The coaching carousel is <Val>suspended</Val>. AI club coaching
                appointments remain static regardless of on-field performance.{' '}
                <Mod show />
              </>
            )}
          </Clause>
        </Section>

        {/* Footer */}
        <div className="mt-16 pt-6 border-t text-center">
          <p className="text-[11px] text-muted-foreground/60 italic">
            These Competition Rules are maintained by AFL House and are updated
            automatically to reflect the settings of this competition. Any
            amendments take effect from the next applicable phase of the
            competition. Rules marked ★ Modified deviate from standard AFL
            Competition Rules. Season {currentYear}.
          </p>
        </div>
      </div>
    </div>
  )
}

import { useParams, Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { FamiliarityBar } from '@/components/coaches/FamiliarityBar'
import { CoachTraitRow } from '@/components/coaches/CoachTraitRow'
import { User, ArrowLeft, Trophy, Calendar } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CoachCareerEntry, CoachPressQuote } from '@/types/coach'

const PHILOSOPHY_LABELS: Record<string, string> = {
  'possession-first': 'Possession First',
  'direct-attack': 'Direct Attack',
  'grind-it-out': 'Grind It Out',
  'defensive-structure': 'Defensive Structure',
  'hybrid-adaptive': 'Hybrid / Adaptive',
}

const RECRUIT_LABELS: Record<string, string> = {
  'youth-first': 'Youth First',
  'prime-window': 'Prime Window',
  'star-driven': 'Star Driven',
  'role-specific': 'Role Specific',
  'best-available': 'Best Available',
}

const TRADE_LABELS: Record<string, string> = {
  'deal-maker': 'Deal Maker',
  'asset-protector': 'Asset Protector',
  'value-seeker': 'Value Seeker',
  'win-now-pusher': 'Win Now Pusher',
  'rebuild-architect': 'Rebuild Architect',
}

const MEDIA_LABELS: Record<string, string> = {
  guarded: 'Guarded',
  combative: 'Combative',
  diplomatic: 'Diplomatic',
  expressive: 'Expressive',
  analytical: 'Analytical',
}

const BACKGROUND_LABELS: Record<string, string> = {
  'former-midfielder': 'Former Midfielder',
  'former-defender': 'Former Defender',
  'former-forward': 'Former Forward',
  'former-ruck': 'Former Ruck',
  'career-coach': 'Career Coach',
}

const TONE_COLORS: Record<CoachPressQuote['tone'], string> = {
  confident: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cautious: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  defiant: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  conceding: 'bg-muted text-muted-foreground',
  deflecting: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  analytical: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

function CareerEntryRow({ entry }: { entry: CoachCareerEntry }) {
  const record = `${entry.wins}W ${entry.losses}L ${entry.draws}D`
  const avgPosition =
    entry.finalLadderPositions.length > 0
      ? (entry.finalLadderPositions.reduce((a, b) => a + b, 0) / entry.finalLadderPositions.length).toFixed(1)
      : '—'
  const years = entry.endYear
    ? `${entry.startYear}–${entry.endYear}`
    : `${entry.startYear}–present`

  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{entry.clubName}</span>
          {entry.departed === 'active' && (
            <Badge variant="secondary" className="text-xs">Current</Badge>
          )}
          {entry.departed === 'fired' && (
            <Badge variant="destructive" className="text-xs">Sacked</Badge>
          )}
          {entry.departed === 'resigned' && (
            <Badge variant="outline" className="text-xs">Retired</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />{years}
          </span>
          <span>{record}</span>
          <span>Avg pos: {avgPosition}</span>
          {entry.premiershipsWon > 0 && (
            <span className="flex items-center gap-0.5 text-amber-600">
              <Trophy className="h-3 w-3" />{entry.premiershipsWon}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function CoachProfilePage() {
  const { coachId } = useParams<{ coachId: string }>()
  const coaches = useGameStore((s) => s.coaches)
  const coachKnowledge = useGameStore((s) => s.coachKnowledge)
  const clubs = useGameStore((s) => s.clubs)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentYear = useGameStore((s) => s.currentYear)

  const coach = coachId ? coaches[coachId] : null
  const knowledge = coachId ? coachKnowledge[coachId] : null

  if (!coach || !knowledge) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Coach not found.</p>
        <Button variant="ghost" asChild className="mt-2">
          <Link to="/coaches"><ArrowLeft className="h-4 w-4 mr-1" />Back to Coaches</Link>
        </Button>
      </div>
    )
  }

  const isOwnClub = coach.currentClubId === playerClubId
  const tier = knowledge.tier
  const keys = knowledge.revealedTraitKeys

  const club = coach.currentClubId ? clubs[coach.currentClubId] : null
  const tenureYears = coach.tenureStartYear != null ? currentYear - coach.tenureStartYear : 0

  // Which fields are revealed
  const has = (key: string) => isOwnClub || keys.includes(key)

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/coaches"><ArrowLeft className="h-4 w-4 mr-1" />Coaches</Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <User className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {tier === 'unknown' && !isOwnClub
              ? 'Unknown Coach'
              : `${coach.firstName} ${coach.lastName}`}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-sm text-muted-foreground">
            <span>{club?.name ?? '—'}</span>
            {has('tenureStartYear') && coach.tenureStartYear && (
              <>
                <span>·</span>
                <span>{tenureYears <= 1 ? 'First season' : `${tenureYears} seasons`}</span>
              </>
            )}
            {isOwnClub && <Badge variant="secondary">Your Club</Badge>}
          </div>
          <div className="mt-2 max-w-xs">
            <FamiliarityBar familiarity={knowledge.familiarity} tier={tier} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tactical">Tactical Profile</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="press">Press</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Career History</CardTitle></CardHeader>
            <CardContent>
              {coach.careerHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No career history yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {coach.careerHistory.map((entry, i) => (
                    <CareerEntryRow key={i} entry={entry} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TACTICAL PROFILE ── */}
        <TabsContent value="tactical" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Philosophy</CardTitle></CardHeader>
            <CardContent>
              <CoachTraitRow
                label="Tactical Philosophy"
                value={has('tacticalPhilosophy') ? (PHILOSOPHY_LABELS[coach.tacticalPhilosophy] ?? coach.tacticalPhilosophy) : undefined}
                revealed={has('tacticalPhilosophy')}
              />
              <CoachTraitRow
                label="Recruiting Philosophy"
                value={has('recruitingPhilosophy') ? (RECRUIT_LABELS[coach.recruitingPhilosophy] ?? coach.recruitingPhilosophy) : undefined}
                revealed={has('recruitingPhilosophy')}
              />
              <CoachTraitRow
                label="Recruiting Age Range"
                value={has('recruitingAgeMin') ? `${coach.recruitingAgeMin}–${coach.recruitingAgeMax}` : undefined}
                revealed={has('recruitingAgeMin')}
              />
              <CoachTraitRow
                label="Trade Style"
                value={has('tradeStyle') ? (TRADE_LABELS[coach.tradeStyle] ?? coach.tradeStyle) : undefined}
                revealed={has('tradeStyle')}
              />
              <CoachTraitRow
                label="Media Personality"
                value={has('mediaPersonality') ? (MEDIA_LABELS[coach.mediaPersonality] ?? coach.mediaPersonality) : undefined}
                revealed={has('mediaPersonality')}
              />
              <CoachTraitRow
                label="Background"
                value={has('background') ? (BACKGROUND_LABELS[coach.background] ?? coach.background) : undefined}
                revealed={has('background')}
              />
            </CardContent>
          </Card>

          {has('traits.riskTolerance') && (
            <Card>
              <CardHeader><CardTitle className="text-base">Personality Traits</CardTitle></CardHeader>
              <CardContent>
                <CoachTraitRow label="Risk Tolerance" value={coach.traits.riskTolerance} revealed numeric />
                <CoachTraitRow label="Adaptability" value={coach.traits.adaptability} revealed numeric />
                <CoachTraitRow label="Youth Patience" value={coach.traits.youthPatience} revealed numeric />
                <CoachTraitRow label="Pressure Handling" value={coach.traits.pressureHandling} revealed numeric />
                <CoachTraitRow label="Aggression Level" value={coach.traits.aggressionLevel} revealed numeric />
              </CardContent>
            </Card>
          )}

          {has('preferredGameplan') && coach.preferredGameplan && Object.keys(coach.preferredGameplan).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Preferred Gameplan</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(coach.preferredGameplan).map(([key, val]) => (
                  <CoachTraitRow
                    key={key}
                    label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                    value={String(val)}
                    revealed
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── DECISIONS ── */}
        <TabsContent value="decisions">
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Decisions</CardTitle></CardHeader>
            <CardContent>
              {!isOwnClub && (tier === 'unknown' || tier === 'aware') ? (
                <p className="text-sm text-muted-foreground">
                  Become more familiar with this coach to see their decisions.
                </p>
              ) : coach.recentDecisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {coach.recentDecisions.slice().reverse().map((decision) => (
                    <div key={decision.id} className="text-sm py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{decision.type.replace(/-/g, ' ')}</Badge>
                        {decision.noteworthiness !== 'routine' && (
                          <Badge variant={decision.noteworthiness === 'headline' ? 'destructive' : 'secondary'} className="text-xs">
                            {decision.noteworthiness}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">{decision.date}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{decision.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PRESS ── */}
        <TabsContent value="press">
          <Card>
            <CardHeader><CardTitle className="text-base">Press Quotes</CardTitle></CardHeader>
            <CardContent>
              {!isOwnClub && (tier === 'unknown' || tier === 'aware') ? (
                <p className="text-sm text-muted-foreground">
                  Become more familiar with this coach to see press quotes.
                </p>
              ) : coach.recentQuotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No press quotes recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {coach.recentQuotes.slice().reverse().map((quote) => (
                    <div key={quote.id} className="py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_COLORS[quote.tone]}`}>
                          {quote.tone}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">{quote.context.replace(/-/g, ' ')}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{quote.date}</span>
                      </div>
                      <blockquote className="text-sm italic border-l-2 border-muted pl-3">
                        "{quote.quote}"
                      </blockquote>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

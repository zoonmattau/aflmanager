import { useState, useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Trophy, Medal, Search, Shield } from 'lucide-react'
import {
  buildLeagueHallOfFame,
  buildPlayerLegacyProfile,
  HOF_STAT_LABELS,
} from '@/engine/history/hallOfFameEngine'
import type { LeagueHallOfFameEntry } from '@/engine/history/hallOfFameEngine'
import type {
  RetirementLegacyEntry,
  SeasonAwardRecord,
  SeasonRecord,
  AFLRecordsBook,
  MilestoneRecord,
  RecordsLeaderboardStat,
} from '@/types/history'
import type { Club } from '@/types/club'

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const TIER_CONFIG = {
  legend: {
    label: 'Legend',
    cls: 'text-yellow-400 border-yellow-400 bg-yellow-900/20',
  },
  'club-great': {
    label: 'Club Great',
    cls: 'text-amber-500 border-amber-500 bg-amber-900/20',
  },
  veteran: {
    label: 'Veteran',
    cls: 'text-slate-400 border-slate-400',
  },
} as const

function TierBadge({ tier }: { tier: RetirementLegacyEntry['tier'] }) {
  const { label, cls } = TIER_CONFIG[tier]
  return (
    <Badge variant="outline" className={`text-[10px] shrink-0 ${cls}`}>
      {label}
    </Badge>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? 'bg-yellow-400 text-yellow-900'
      : rank === 2
        ? 'bg-slate-300 text-slate-900'
        : rank === 3
          ? 'bg-amber-600 text-amber-100'
          : 'bg-muted text-muted-foreground'
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${cls}`}
    >
      {rank}
    </span>
  )
}

function fmt(n: number) {
  return n.toLocaleString()
}

// ---------------------------------------------------------------------------
// Award row
// ---------------------------------------------------------------------------

function AwardRow({
  label,
  count,
  years,
  cls,
  badgeCls,
}: {
  label: string
  count: number
  years: string[]
  cls: string
  badgeCls: string
}) {
  return (
    <div className={`rounded-md border px-3 py-2 ${cls}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <Badge variant="outline" className={`text-[10px] ${badgeCls}`}>
          ×{count}
        </Badge>
      </div>
      {years.length > 0 && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{years.join(', ')}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Player Legacy Dialog
// ---------------------------------------------------------------------------

function LegacyDialog({
  entry,
  awards,
  seasons,
  recordsBook,
  milestones,
  legacies,
  open,
  onClose,
}: {
  entry: LeagueHallOfFameEntry
  awards: SeasonAwardRecord[]
  seasons: SeasonRecord[]
  recordsBook: AFLRecordsBook
  milestones: MilestoneRecord[]
  legacies: RetirementLegacyEntry[]
  open: boolean
  onClose: () => void
}) {
  const legacy = legacies.find((l) => l.playerId === entry.playerId)

  const profile = useMemo(() => {
    if (!legacy) return null
    return buildPlayerLegacyProfile(legacy, awards, seasons, recordsBook, milestones)
  }, [legacy, awards, seasons, recordsBook, milestones])

  if (!profile) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-xl">{profile.playerName}</DialogTitle>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <TierBadge tier={profile.tier} />
                <span className="text-xs text-muted-foreground">{profile.primaryPosition}</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{profile.primaryClubName}</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">Retired {profile.retiredYear}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold text-primary">
                {profile.careerScore.toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Career Score
              </div>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            {/* Career totals */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Career Statistics
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: 'Games', value: fmt(profile.gamesPlayed) },
                  { label: 'Goals', value: fmt(profile.goals) },
                  { label: 'Disposals', value: fmt(profile.disposals) },
                  { label: 'Marks', value: fmt(profile.marks) },
                  { label: 'Tackles', value: fmt(profile.tackles) },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-md bg-muted/40 px-2 py-2 text-center"
                  >
                    <div className="text-sm font-semibold">{s.value}</div>
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2 mt-1.5">
                {[
                  { label: 'Goals/gm', value: profile.goalsPerGame.toFixed(1) },
                  { label: 'Disp/gm', value: profile.disposalsPerGame.toFixed(1) },
                  { label: 'Marks/gm', value: profile.marksPerGame.toFixed(1) },
                  { label: 'Tack/gm', value: profile.tacklesPerGame.toFixed(1) },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-md bg-muted/20 px-2 py-1.5 text-center"
                  >
                    <div className="text-xs font-medium">{s.value}</div>
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            {/* Awards */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Awards & Honours
              </h3>
              {profile.brownlowCount === 0 &&
              profile.colemanCount === 0 &&
              profile.allAustralianCount === 0 &&
              !profile.isRisingStar &&
              profile.bestAndFairestCount === 0 ? (
                <p className="text-xs text-muted-foreground">No individual awards recorded.</p>
              ) : (
                <div className="space-y-1.5">
                  {profile.brownlowCount > 0 && (
                    <AwardRow
                      label="Brownlow Medal"
                      count={profile.brownlowCount}
                      years={profile.awardsProfile.brownlows.map((b) => String(b.year))}
                      cls="bg-yellow-900/20 border-yellow-900/30"
                      badgeCls="text-yellow-400 border-yellow-400"
                    />
                  )}
                  {profile.colemanCount > 0 && (
                    <AwardRow
                      label="Coleman Medal"
                      count={profile.colemanCount}
                      years={profile.awardsProfile.colemans.map((c) => String(c.year))}
                      cls="bg-blue-900/20 border-blue-900/30"
                      badgeCls="text-blue-400 border-blue-400"
                    />
                  )}
                  {profile.allAustralianCount > 0 && (
                    <AwardRow
                      label="All-Australian"
                      count={profile.allAustralianCount}
                      years={profile.awardsProfile.allAustralians.map(String)}
                      cls="bg-green-900/20 border-green-900/30"
                      badgeCls="text-green-400 border-green-400"
                    />
                  )}
                  {profile.isRisingStar && (
                    <div className="flex items-center justify-between rounded-md bg-purple-900/20 border border-purple-900/30 px-3 py-2">
                      <span className="text-xs font-medium">Rising Star</span>
                      <span className="text-[10px] text-muted-foreground">
                        {profile.awardsProfile.risingStar}
                      </span>
                    </div>
                  )}
                  {profile.bestAndFairestCount > 0 && (
                    <AwardRow
                      label="Club Best & Fairest"
                      count={profile.bestAndFairestCount}
                      years={profile.awardsProfile.bestAndFairest.map((b) => String(b.year))}
                      cls="bg-muted/40 border-border"
                      badgeCls="text-foreground border-foreground/30"
                    />
                  )}
                </div>
              )}
            </section>

            {/* Premierships */}
            {profile.premiershipYearsAtClub.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Premierships — {profile.primaryClubName}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.premiershipYearsAtClub.map((y) => (
                      <Badge
                        key={y}
                        variant="outline"
                        className="text-yellow-400 border-yellow-400 bg-yellow-900/20 text-[11px]"
                      >
                        <Trophy className="h-2.5 w-2.5 mr-1" />
                        {y}
                      </Badge>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* Career records held */}
            {profile.careerRecordsHeld.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    All-Time Records
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.careerRecordsHeld.map((stat) => (
                      <Badge key={stat} variant="secondary" className="text-[10px]">
                        #1 {HOF_STAT_LABELS[stat as RecordsLeaderboardStat]}
                      </Badge>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* Milestones */}
            {profile.milestones.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Career Milestones
                  </h3>
                  <div className="space-y-1">
                    {profile.milestones.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span>
                          {m.threshold}{' '}
                          {m.type.replace('career-', '').replace(/-/g, ' ')}
                        </span>
                        <span className="text-muted-foreground">
                          Rd {m.round}, {m.year}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* Retirement ceremony */}
            {(profile.ceremonyHeadline || profile.ceremonySummary) && (
              <>
                <Separator />
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Retirement Ceremony
                  </h3>
                  {profile.ceremonyHeadline && (
                    <p className="text-sm font-medium mb-1">{profile.ceremonyHeadline}</p>
                  )}
                  {profile.ceremonySummary && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {profile.ceremonySummary}
                    </p>
                  )}
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// HoF entry row
// ---------------------------------------------------------------------------

function HofRow({
  entry,
  onClick,
  clubColor,
}: {
  entry: LeagueHallOfFameEntry
  onClick: () => void
  clubColor: string | undefined
}) {
  const awardStr = [
    entry.brownlowCount > 0 ? `B×${entry.brownlowCount}` : '',
    entry.colemanCount > 0 ? `C×${entry.colemanCount}` : '',
    entry.allAustralianCount > 0 ? `AA×${entry.allAustralianCount}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/40 transition-colors text-left group"
    >
      <RankBadge rank={entry.rank} />

      <div
        className="h-7 w-1 rounded-full shrink-0"
        style={{ backgroundColor: clubColor ?? 'hsl(var(--muted))' }}
      />

      {/* Name & meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold group-hover:text-primary transition-colors truncate">
            {entry.playerName}
          </span>
          <TierBadge tier={entry.tier} />
          {entry.hallOfFameEligible && (
            <Badge
              variant="outline"
              className="text-[9px] text-emerald-400 border-emerald-400 h-4 px-1"
            >
              HoF
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {entry.primaryClubName} · {entry.primaryPosition} · Ret.&nbsp;{entry.retiredYear}
        </div>
      </div>

      {/* Key numbers */}
      <div className="hidden sm:flex items-center gap-4 text-right shrink-0">
        <div>
          <div className="text-xs font-medium">{fmt(entry.gamesPlayed)}</div>
          <div className="text-[9px] text-muted-foreground">games</div>
        </div>
        <div>
          <div className="text-xs font-medium">{fmt(entry.goals)}</div>
          <div className="text-[9px] text-muted-foreground">goals</div>
        </div>
        <div className="w-16">
          <div className="text-xs font-medium">{awardStr || '—'}</div>
          <div className="text-[9px] text-muted-foreground">awards</div>
        </div>
        <div className="w-14 text-right">
          <div className="text-xs font-bold text-primary">{fmt(entry.careerScore)}</div>
          <div className="text-[9px] text-muted-foreground">score</div>
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Ranked HoF list tab
// ---------------------------------------------------------------------------

type TierFilter = 'all' | 'legend' | 'club-great'

function HofListTab({
  entries,
  onSelect,
  clubs,
}: {
  entries: LeagueHallOfFameEntry[]
  onSelect: (e: LeagueHallOfFameEntry) => void
  clubs: Record<string, Club>
}) {
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (tierFilter !== 'all' && e.tier !== tierFilter) return false
        if (search && !e.playerName.toLowerCase().includes(search.toLowerCase())) return false
        return true
      }),
    [entries, tierFilter, search],
  )

  const legendCount = entries.filter((e) => e.tier === 'legend').length
  const greatCount = entries.filter((e) => e.tier === 'club-great').length

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Trophy className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium">No legends yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            The Hall of Fame populates as players retire across seasons.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-yellow-400 border-yellow-400 bg-yellow-900/20">
          <Trophy className="h-3 w-3 mr-1" />
          {legendCount} {legendCount === 1 ? 'Legend' : 'Legends'}
        </Badge>
        <Badge variant="outline" className="text-amber-500 border-amber-500 bg-amber-900/20">
          <Medal className="h-3 w-3 mr-1" />
          {greatCount} Club {greatCount === 1 ? 'Great' : 'Greats'}
        </Badge>
        <Badge variant="outline">{entries.length} total</Badge>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search player…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs w-52"
          />
        </div>
        {(['all', 'legend', 'club-great'] as TierFilter[]).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tierFilter === t ? 'default' : 'outline'}
            className="h-8 text-xs"
            onClick={() => setTierFilter(t)}
          >
            {t === 'all' ? 'All' : t === 'legend' ? 'Legends' : 'Club Greats'}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="py-2 px-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No results</p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((entry) => (
                <HofRow
                  key={entry.playerId}
                  entry={entry}
                  onClick={() => onSelect(entry)}
                  clubColor={clubs[entry.primaryClubId]?.colors.primary}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Club Halls tab
// ---------------------------------------------------------------------------

function ClubHallsTab({
  legacies,
  clubs,
  onSelect,
  hofById,
}: {
  legacies: RetirementLegacyEntry[]
  clubs: Record<string, Club>
  onSelect: (e: LeagueHallOfFameEntry) => void
  hofById: Map<string, LeagueHallOfFameEntry>
}) {
  const inducted = useMemo(
    () => legacies.filter((l) => l.inductedClubHallOfFame),
    [legacies],
  )

  const byClub = useMemo(() => {
    const map = new Map<string, RetirementLegacyEntry[]>()
    for (const l of inducted) {
      const list = map.get(l.retiredFromClubId) ?? []
      list.push(l)
      map.set(l.retiredFromClubId, list)
    }
    return map
  }, [inducted])

  const clubIds = useMemo(
    () =>
      [...byClub.keys()].sort(
        (a, b) => (byClub.get(b)?.length ?? 0) - (byClub.get(a)?.length ?? 0),
      ),
    [byClub],
  )

  if (inducted.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium">No club halls of fame yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Club halls of fame fill when legendary players retire.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {clubIds.map((clubId) => {
        const club = clubs[clubId]
        const members = [...(byClub.get(clubId) ?? [])].sort((a, b) => {
          const tierOrder: Record<string, number> = { legend: 0, 'club-great': 1, veteran: 2 }
          const diff = (tierOrder[a.tier] ?? 2) - (tierOrder[b.tier] ?? 2)
          return diff !== 0 ? diff : b.gamesPlayed - a.gamesPlayed
        })

        return (
          <Card key={clubId}>
            <CardHeader className="pb-2 px-4 pt-3">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: club?.colors.primary ?? '#888' }}
                />
                <CardTitle className="text-sm">{club?.fullName ?? clubId}</CardTitle>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {members.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="space-y-0.5">
                {members.map((l) => {
                  const hofEntry = hofById.get(l.playerId)
                  return (
                    <button
                      key={l.playerId}
                      onClick={() => hofEntry && onSelect(hofEntry)}
                      disabled={!hofEntry}
                      className="w-full flex items-center justify-between text-left rounded px-2 py-1.5 hover:bg-accent/40 transition-colors disabled:opacity-60"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TierBadge tier={l.tier} />
                        <span className="text-xs font-medium truncate">{l.playerName}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[10px] text-muted-foreground">
                        <span>{l.gamesPlayed} gms</span>
                        <span>{l.goals} gls</span>
                        <span>Ret.&nbsp;{l.retiredYear}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function HallOfFamePage() {
  const history = useGameStore((s) => s.history)
  const clubs = useGameStore((s) => s.clubs)

  const [selectedEntry, setSelectedEntry] = useState<LeagueHallOfFameEntry | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const hofEntries = useMemo(
    () =>
      buildLeagueHallOfFame(
        history.retirementLegacies,
        history.awards,
        history.seasons,
        history.recordsBook,
      ),
    [history.retirementLegacies, history.awards, history.seasons, history.recordsBook],
  )

  const hofById = useMemo(
    () => new Map(hofEntries.map((e) => [e.playerId, e])),
    [hofEntries],
  )

  const handleSelect = (entry: LeagueHallOfFameEntry) => {
    setSelectedEntry(entry)
    setDialogOpen(true)
  }

  return (
    <div className="container max-w-4xl py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-yellow-400" />
        <div>
          <h1 className="text-xl font-bold">Hall of Fame</h1>
          <p className="text-xs text-muted-foreground">Greatest players in league history</p>
        </div>
      </div>

      <Tabs defaultValue="hof">
        <TabsList>
          <TabsTrigger value="hof">
            <Trophy className="h-3.5 w-3.5 mr-1.5" />
            Ranked Legends
          </TabsTrigger>
          <TabsTrigger value="clubs">
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Club Halls
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hof" className="mt-4">
          <HofListTab entries={hofEntries} onSelect={handleSelect} clubs={clubs} />
        </TabsContent>

        <TabsContent value="clubs" className="mt-4">
          <ClubHallsTab
            legacies={history.retirementLegacies}
            clubs={clubs}
            onSelect={handleSelect}
            hofById={hofById}
          />
        </TabsContent>
      </Tabs>

      {/* Player legacy dialog */}
      {selectedEntry && (
        <LegacyDialog
          entry={selectedEntry}
          awards={history.awards}
          seasons={history.seasons}
          recordsBook={history.recordsBook}
          milestones={history.milestones}
          legacies={history.retirementLegacies}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}


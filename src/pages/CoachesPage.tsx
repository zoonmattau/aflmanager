import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import type { CoachFamiliarityTier } from '@/types/coach'
import { FamiliarityBar, TierBadge } from '@/components/coaches/FamiliarityBar'
import { User } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

const TIERS: Array<CoachFamiliarityTier | 'all'> = ['all', 'unknown', 'aware', 'familiar', 'well-scouted', 'book-on']

const TIER_LABELS: Record<CoachFamiliarityTier | 'all', string> = {
  all: 'All',
  unknown: 'Unknown',
  aware: 'Aware',
  familiar: 'Familiar',
  'well-scouted': 'Well Scouted',
  'book-on': 'Book On',
}

const PHILOSOPHY_LABELS: Record<string, string> = {
  'possession-first': 'Possession First',
  'direct-attack': 'Direct Attack',
  'grind-it-out': 'Grind It Out',
  'defensive-structure': 'Defensive Structure',
  'hybrid-adaptive': 'Hybrid / Adaptive',
}

export function CoachesPage() {
  const coaches = useGameStore((s) => s.coaches)
  const coachKnowledge = useGameStore((s) => s.coachKnowledge)
  const clubs = useGameStore((s) => s.clubs)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const currentYear = useGameStore((s) => s.currentYear)
  const [filterTier, setFilterTier] = useState<CoachFamiliarityTier | 'all'>('all')

  const rows = useMemo(() => {
    return Object.values(coaches)
      .filter((coach) => coach.currentClubId != null)
      .map((coach) => {
        const knowledge = coachKnowledge[coach.id]
        const club = coach.currentClubId ? clubs[coach.currentClubId] : null
        const isOwnClub = coach.currentClubId === playerClubId
        return { coach, knowledge, club, isOwnClub }
      })
      .filter(({ knowledge }) => {
        if (!knowledge) return false
        if (filterTier === 'all') return true
        return knowledge.tier === filterTier
      })
      .sort((a, b) => {
        // Own club first
        if (a.isOwnClub && !b.isOwnClub) return -1
        if (!a.isOwnClub && b.isOwnClub) return 1
        // Then by familiarity descending
        const fa = a.knowledge?.familiarity ?? 0
        const fb = b.knowledge?.familiarity ?? 0
        return fb - fa
      })
  }, [coaches, coachKnowledge, clubs, playerClubId, filterTier])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Coaches</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scout rival coaches by playing against them and tracking news about their clubs.
        </p>
      </div>

      <Tabs value={filterTier} onValueChange={(v) => setFilterTier(v as CoachFamiliarityTier | 'all')}>
        <TabsList>
          {TIERS.map((tier) => (
            <TabsTrigger key={tier} value={tier}>
              {TIER_LABELS[tier]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Coach</TableHead>
              <TableHead>Club</TableHead>
              <TableHead>Tenure</TableHead>
              <TableHead>Tactical Style</TableHead>
              <TableHead className="w-48">Familiarity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No coaches match this filter.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ coach, knowledge, club, isOwnClub }) => {
              const tier = knowledge?.tier ?? 'unknown'
              const isUnknown = tier === 'unknown' && !isOwnClub

              return (
                <TableRow key={coach.id}>
                  <TableCell>
                    <Link to={`/coaches/${coach.id}`} className="flex items-center gap-2 hover:underline">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span className="font-medium">
                        {isUnknown ? 'Unknown Coach' : `${coach.firstName} ${coach.lastName}`}
                      </span>
                      {isOwnClub && (
                        <Badge variant="secondary" className="text-xs">Your Club</Badge>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {club?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(isOwnClub || tier !== 'unknown') && coach.tenureStartYear
                      ? `${currentYear - coach.tenureStartYear + 1}yr`
                      : '???'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(isOwnClub || tier !== 'unknown') && coach.tacticalPhilosophy
                      ? PHILOSOPHY_LABELS[coach.tacticalPhilosophy] ?? coach.tacticalPhilosophy
                      : <span className="text-muted-foreground">???</span>}
                  </TableCell>
                  <TableCell>
                    {knowledge ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <FamiliarityBar
                            familiarity={knowledge.familiarity}
                            tier={knowledge.tier}
                            showLabel={false}
                          />
                        </div>
                        <TierBadge tier={knowledge.tier} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

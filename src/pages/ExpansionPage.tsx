import { useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Building2, CalendarPlus, CheckCircle2, Clock } from 'lucide-react'
import expansionClubsData from '@/data/expansionClubs.json'
import type { ExpansionClubData } from '@/types/expansion'

const expansionClubs = expansionClubsData as ExpansionClubData[]

const STATUS_LABELS = {
  planned: 'Planned',
  vfl: 'VFL Development',
  active: 'Active (AFL)',
  established: 'Established',
} as const

const STATUS_COLORS = {
  planned: 'text-zinc-400',
  vfl: 'text-amber-400',
  active: 'text-emerald-400',
  established: 'text-blue-400',
} as const

export function ExpansionPage() {
  const currentYear = useGameStore((s) => s.currentYear)
  const leagueConfig = useGameStore((s) => s.leagueConfig)
  const clubs = useGameStore((s) => s.clubs)

  const activeExpansionPlans = leagueConfig.expansionPlans
  const availableExpansionClubs = expansionClubs.filter(
    (ec) => !leagueConfig.activeClubIds.includes(ec.id) &&
            !activeExpansionPlans.some((p) => p.clubId === ec.id)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">Expansion</h1>
          <p className="text-sm text-muted-foreground">
            Manage league expansion and new team entry
          </p>
        </div>
      </div>

      {/* League Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">League Overview</CardTitle>
          <CardDescription>
            {leagueConfig.totalTeams} teams currently in the AFL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Active Teams</p>
              <p className="text-2xl font-bold">{leagueConfig.activeClubIds.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expansion Plans</p>
              <p className="text-2xl font-bold">{activeExpansionPlans.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current Year</p>
              <p className="text-2xl font-bold">{currentYear}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Available Candidates</p>
              <p className="text-2xl font-bold">{availableExpansionClubs.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Expansion Plans */}
      {activeExpansionPlans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Active Expansion Plans</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {activeExpansionPlans.map((plan) => {
              const club = clubs[plan.clubId]
              const expansionData = expansionClubs.find((ec) => ec.id === plan.clubId)
              const name = club?.fullName ?? expansionData?.fullName ?? plan.clubId
              const colors = club?.colors ?? expansionData?.colors

              return (
                <Card key={plan.clubId}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      {colors && (
                        <div
                          className="h-8 w-8 shrink-0 rounded-full"
                          style={{
                            background: `linear-gradient(135deg, ${colors.primary} 50%, ${colors.secondary} 50%)`,
                          }}
                        />
                      )}
                      <div>
                        <CardTitle className="text-base">{name}</CardTitle>
                        <p className={`text-xs ${STATUS_COLORS[plan.status]}`}>
                          {STATUS_LABELS[plan.status]}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">AFL Entry Year</span>
                        <span>{plan.aflEntryYear}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Priority Picks</span>
                        <span>{plan.priorityPicksPerYear}/year for {plan.priorityPickYears} years</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Salary Concession</span>
                        <span>
                          {plan.salaryCapConcession > 0
                            ? `+$${(plan.salaryCapConcession / 1_000_000).toFixed(1)}M for ${plan.salaryCapConcessionYears}yr`
                            : 'None'}
                        </span>
                      </div>
                      {plan.status === 'planned' && (
                        <div className="flex items-center gap-1 text-xs text-amber-400">
                          <Clock className="h-3 w-3" />
                          Enters AFL in {plan.aflEntryYear - currentYear} year{plan.aflEntryYear - currentYear !== 1 ? 's' : ''}
                        </div>
                      )}
                      {plan.status === 'active' && (
                        <div className="flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Currently competing
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Available Expansion Candidates */}
      {availableExpansionClubs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Expansion Candidates</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {availableExpansionClubs.map((ec) => (
              <ExpansionCandidateCard key={ec.id} club={ec} currentYear={currentYear} />
            ))}
          </div>
        </div>
      )}

      {availableExpansionClubs.length === 0 && activeExpansionPlans.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No expansion plans or candidates available at this time.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ExpansionCandidateCard({
  club,
  currentYear,
}: {
  club: ExpansionClubData
  currentYear: number
}) {
  const [entryYear, setEntryYear] = useState(
    String(Math.max(club.suggestedEntryYear, currentYear + 2))
  )

  // Build year options: current + 2 to current + 10
  const yearOptions = Array.from({ length: 9 }, (_, i) => String(currentYear + 2 + i))

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 shrink-0 rounded-full"
            style={{
              background: `linear-gradient(135deg, ${club.colors.primary} 50%, ${club.colors.secondary} 50%)`,
            }}
          />
          <div>
            <CardTitle className="text-base">{club.fullName}</CardTitle>
            <p className="text-xs text-muted-foreground">{club.mascot}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Home Ground</span>
              <span>{club.homeGround}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Suggested Entry</span>
              <span>{club.suggestedEntryYear}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">AFL Entry Year</Label>
            <Select value={entryYear} onValueChange={setEntryYear}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" className="w-full" variant="outline">
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
            Schedule Expansion
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

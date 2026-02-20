import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Megaphone,
  AlertTriangle,
  Handshake,
  ArrowRight,
  CheckCircle2,
  Info,
  Building2,
  GraduationCap,
  UserSearch,
  Stethoscope,
  Search,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RevenueBreakdown, ExpenseBreakdown } from '@/engine/clubs/clubManagement'
import type { FinancialSeasonRecord } from '@/types/historyArchive'
import type { ClubBudgetAllocation } from '@/types/club'
import type { ClubLoan } from '@/types/finance'
import {
  calculateFinancialHealth,
  generateProjections,
  getDepartmentBudgetLines,
  getLoanOptions,
} from '@/engine/clubs/financePlanningEngine'
import {
  getClubBudgetAllocation,
  BUDGET_DEPARTMENTS,
  MIN_DEPARTMENT_PCT,
  MAX_DEPARTMENT_PCT,
} from '@/engine/clubs/budgetEngine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number, compact = false) {
  if (compact && Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (compact && Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

function pct(part: number, total: number) {
  if (total === 0) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function fmtPct(n: number) { return `${(n * 100).toFixed(0)}%` }

const REVENUE_COLORS: Record<keyof Omit<RevenueBreakdown, 'total'>, string> = {
  matchDay: 'bg-blue-500',
  membership: 'bg-purple-500',
  sponsorship: 'bg-yellow-500',
  broadcasting: 'bg-green-500',
  merchandise: 'bg-pink-500',
  aflDistribution: 'bg-orange-500',
  finalsRevenue: 'bg-red-500',
  specialEvents: 'bg-cyan-500',
}

const REVENUE_LABELS: Record<keyof Omit<RevenueBreakdown, 'total'>, string> = {
  matchDay: 'Gate Revenue',
  membership: 'Membership',
  sponsorship: 'Sponsorship',
  broadcasting: 'Broadcasting',
  merchandise: 'Merchandise',
  aflDistribution: 'AFL Distribution',
  finalsRevenue: 'Finals Revenue',
  specialEvents: 'Special Events',
}

const EXPENSE_COLORS: Record<keyof Omit<ExpenseBreakdown, 'total'>, string> = {
  playerSalaries: 'bg-red-500',
  staffSalaries: 'bg-orange-500',
  facilityMaintenance: 'bg-yellow-500',
  operations: 'bg-gray-500',
  travel: 'bg-blue-500',
  medical: 'bg-green-500',
  scouting: 'bg-purple-500',
}

const EXPENSE_LABELS: Record<keyof Omit<ExpenseBreakdown, 'total'>, string> = {
  playerSalaries: 'Player Salaries',
  staffSalaries: 'Staff Salaries',
  facilityMaintenance: 'Facilities',
  operations: 'Operations',
  travel: 'Travel',
  medical: 'Medical',
  scouting: 'Scouting',
}

const ICON_MAP: Record<string, LucideIcon> = {
  Building2,
  GraduationCap,
  UserSearch,
  Stethoscope,
  Search,
  Megaphone,
}

const REVENUE_KEYS = Object.keys(REVENUE_LABELS) as (keyof Omit<RevenueBreakdown, 'total'>)[]
const EXPENSE_KEYS = Object.keys(EXPENSE_LABELS) as (keyof Omit<ExpenseBreakdown, 'total'>)[]

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

function StackedBar({ data, colors, total }: {
  data: { key: string; value: number }[]
  colors: Record<string, string>
  total: number
}) {
  if (total === 0) return <div className="h-5 bg-muted rounded-full" />
  return (
    <div className="flex h-5 rounded-full overflow-hidden w-full">
      {data.filter(d => d.value > 0).map(d => (
        <div
          key={d.key}
          className={`${colors[d.key]} flex-shrink-0`}
          style={{ width: `${(d.value / total) * 100}%` }}
          title={`${REVENUE_LABELS[d.key as keyof typeof REVENUE_LABELS] ?? EXPENSE_LABELS[d.key as keyof typeof EXPENSE_LABELS] ?? d.key}: ${fmt(d.value)}`}
        />
      ))}
    </div>
  )
}

function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === 'A+' || grade === 'A' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    : grade === 'B' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    : grade === 'C' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    : grade === 'D' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xl font-bold ${color}`}>
      {grade}
    </span>
  )
}

function CapacityBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    excellent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    good: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    limited: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    constrained: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${map[level] ?? ''}`}>
      {level}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ clubId }: { clubId: string }) {
  const navigate = useNavigate()
  const { clubs, history, sponsorshipOffers } = useGameStore((s) => ({
    clubs: s.clubs,
    history: s.history,
    sponsorshipOffers: s.sponsorshipOffers,
  }))
  const playersRecord = useGameStore((s) => s.players)
  const staffRecord = useGameStore((s) => s.staff)
  const players = useMemo(() => Object.values(playersRecord), [playersRecord])
  const staff = useMemo(() => Object.values(staffRecord), [staffRecord])

  const club = clubs[clubId]
  if (!club) return null

  const health = useMemo(
    () => calculateFinancialHealth(club, players, staff),
    [club, players, staff],
  )

  const revenue = club.finances.seasonRevenue
  const expenses = club.finances.seasonExpenses
  const pnl = club.finances.seasonPnL ?? 0
  const balance = club.finances.balance

  const clubHistory = (history.financialHistory ?? [])
    .filter((r: FinancialSeasonRecord) => r.clubId === clubId)
    .slice()
    .reverse()
    .slice(0, 5)

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-xl font-bold text-green-600">{revenue ? fmt(revenue.total) : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Expenses</p>
            <p className="text-xl font-bold text-red-600">{expenses ? fmt(expenses.total) : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Net P&L</p>
            <p className={`text-xl font-bold ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {revenue ? fmt(pnl) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Club Balance</p>
            <p className={`text-xl font-bold ${balance >= 0 ? 'text-foreground' : 'text-red-600'}`}>
              {fmt(balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Financial health summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Financial Health</span>
            <GradeBadge grade={health.grade} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Health score</span>
              <span className="font-medium">{health.score}/100</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  health.score >= 70 ? 'bg-green-500' : health.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${health.score}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-2">
              <span className="text-muted-foreground">Staff hiring</span>
              <CapacityBadge level={health.staffHiringCapacity} />
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-2">
              <span className="text-muted-foreground">Facility invest.</span>
              <CapacityBadge level={health.facilityInvestmentCapacity} />
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-2">
              <span className="text-muted-foreground">Sustainability</span>
              <CapacityBadge level={health.sustainabilityRating} />
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-2">
              <span className="text-muted-foreground">Board impact</span>
              <span className={`text-xs font-medium ${health.boardImpact >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {health.boardImpact > 0 ? '+' : ''}{health.boardImpact}
              </span>
            </div>
          </div>
          {health.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{w}</span>
            </div>
          ))}
          {health.recommendations.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{r}</span>
            </div>
          ))}
          {health.warnings.length === 0 && health.recommendations.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Finances are in excellent shape — no immediate concerns.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sponsor offers shortcut */}
      {sponsorshipOffers.length > 0 && (
        <Button variant="outline" size="sm" onClick={() => navigate('/sponsorship')}>
          <Handshake className="w-4 h-4 mr-2" />
          {sponsorshipOffers.length} Sponsor Offer{sponsorshipOffers.length !== 1 ? 's' : ''} Pending
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      )}

      {/* Revenue breakdown */}
      {revenue && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <StackedBar
              data={REVENUE_KEYS.map(k => ({ key: k, value: revenue[k] }))}
              colors={REVENUE_COLORS as Record<string, string>}
              total={revenue.total}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {REVENUE_KEYS.filter(k => revenue[k] > 0).map(k => (
                <div key={k} className="flex items-center gap-1 text-xs">
                  <span className={`w-2 h-2 rounded-full ${REVENUE_COLORS[k]}`} />
                  <span className="text-muted-foreground">{REVENUE_LABELS[k]}</span>
                  <span className="font-medium">{fmt(revenue[k])}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {expenses && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <StackedBar
              data={EXPENSE_KEYS.map(k => ({ key: k, value: expenses[k] }))}
              colors={EXPENSE_COLORS as Record<string, string>}
              total={expenses.total}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {EXPENSE_KEYS.filter(k => expenses[k] > 0).map(k => (
                <div key={k} className="flex items-center gap-1 text-xs">
                  <span className={`w-2 h-2 rounded-full ${EXPENSE_COLORS[k]}`} />
                  <span className="text-muted-foreground">{EXPENSE_LABELS[k]}</span>
                  <span className="font-medium">{fmt(expenses[k])}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!revenue && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Season financial data will appear here after the season ends.</p>
          </CardContent>
        </Card>
      )}

      {/* Historical record */}
      {clubHistory.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Seasons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left py-1 pr-4">Year</th>
                    <th className="text-right py-1 pr-4">Revenue</th>
                    <th className="text-right py-1 pr-4">Expenses</th>
                    <th className="text-right py-1 pr-4">P&L</th>
                    <th className="text-right py-1">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {clubHistory.map((r: FinancialSeasonRecord) => (
                    <tr key={r.year} className="border-b last:border-0">
                      <td className="py-1.5 pr-4 font-medium">{r.year}</td>
                      <td className="text-right py-1.5 pr-4 text-green-600">{fmt(r.revenue.total)}</td>
                      <td className="text-right py-1.5 pr-4 text-red-600">{fmt(r.expenses.total)}</td>
                      <td className={`text-right py-1.5 pr-4 font-medium ${r.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {r.pnl >= 0 ? '+' : ''}{fmt(r.pnl)}
                      </td>
                      <td className="text-right py-1.5">{fmt(r.closingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Revenue detail tab
// ---------------------------------------------------------------------------

function RevenueTab({ clubId }: { clubId: string }) {
  const clubs = useGameStore((s) => s.clubs)
  const history = useGameStore((s) => s.history)
  const club = clubs[clubId]
  const revenue = club?.finances.seasonRevenue

  const clubHistory = (history.financialHistory ?? [])
    .filter((r: FinancialSeasonRecord) => r.clubId === clubId)
    .slice()
    .reverse()
    .slice(0, 5)
  const prevSeason = clubHistory[1]

  function revChange(key: keyof Omit<RevenueBreakdown, 'total'>) {
    if (!revenue || !prevSeason?.revenue) return null
    const curr = revenue[key]
    const prev = prevSeason.revenue[key]
    if (prev === 0) return null
    return ((curr - prev) / prev) * 100
  }

  if (!revenue) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <p className="text-sm">No revenue data yet. Play through a season to see breakdown.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Total: <span className="font-bold text-foreground">{fmt(revenue.total)}</span></p>
      {REVENUE_KEYS.map(k => {
        const change = revChange(k)
        return (
          <Card key={k}>
            <CardContent className="py-3 flex items-center gap-4">
              <div className={`w-1.5 h-12 rounded-full flex-shrink-0 ${REVENUE_COLORS[k]}`} />
              <div className="flex-1">
                <p className="font-medium text-sm">{REVENUE_LABELS[k]}</p>
                <div className="w-full bg-muted h-1.5 rounded-full mt-1">
                  <div
                    className={`h-1.5 rounded-full ${REVENUE_COLORS[k]}`}
                    style={{ width: `${Math.min(100, (revenue[k] / revenue.total) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-right flex-shrink-0 min-w-[80px]">
                <p className="font-bold">{fmt(revenue[k])}</p>
                <p className="text-xs text-muted-foreground">{pct(revenue[k], revenue.total)}</p>
              </div>
              {change !== null && (
                <div className="flex-shrink-0">
                  {change > 0
                    ? <Badge variant="outline" className="text-green-600 border-green-200 text-xs"><TrendingUp className="w-3 h-3 mr-1" />{change.toFixed(1)}%</Badge>
                    : <Badge variant="outline" className="text-red-600 border-red-200 text-xs"><TrendingDown className="w-3 h-3 mr-1" />{Math.abs(change).toFixed(1)}%</Badge>
                  }
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expenses detail tab
// ---------------------------------------------------------------------------

function ExpensesTab({ clubId }: { clubId: string }) {
  const clubs = useGameStore((s) => s.clubs)
  const club = clubs[clubId]
  const expenses = club?.finances.seasonExpenses

  if (!expenses) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <p className="text-sm">No expense data yet. Play through a season to see breakdown.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Total: <span className="font-bold text-foreground">{fmt(expenses.total)}</span></p>
      {EXPENSE_KEYS.map(k => (
        <Card key={k}>
          <CardContent className="py-3 flex items-center gap-4">
            <div className={`w-1.5 h-12 rounded-full flex-shrink-0 ${EXPENSE_COLORS[k]}`} />
            <div className="flex-1">
              <p className="font-medium text-sm">{EXPENSE_LABELS[k]}</p>
              <div className="w-full bg-muted h-1.5 rounded-full mt-1">
                <div
                  className={`h-1.5 rounded-full ${EXPENSE_COLORS[k]}`}
                  style={{ width: `${Math.min(100, (expenses[k] / expenses.total) * 100)}%` }}
                />
              </div>
            </div>
            <div className="text-right flex-shrink-0 min-w-[80px]">
              <p className="font-bold">{fmt(expenses[k])}</p>
              <p className="text-xs text-muted-foreground">{pct(expenses[k], expenses.total)}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Membership tab
// ---------------------------------------------------------------------------

function MembershipTab({ clubId }: { clubId: string }) {
  const navigate = useNavigate()
  const { clubs, phase, runMembershipCampaign, sponsorshipOffers } = useGameStore((s) => ({
    clubs: s.clubs,
    phase: s.phase,
    runMembershipCampaign: s.runMembershipCampaign,
    sponsorshipOffers: s.sponsorshipOffers,
  }))
  const [campaignBudget, setCampaignBudget] = useState(200_000)
  const [campaignResult, setCampaignResult] = useState<{ success: boolean; boost: number } | null>(null)

  const club = clubs[clubId]
  if (!club) return null
  const balance = club.finances.balance
  const membershipData = club.finances.membershipData
  const isOffseason = phase === 'offseason'
  const projectedBoost = Math.round(campaignBudget / 300) * 1000
  const canCampaign = isOffseason && balance >= campaignBudget

  function handleCampaign() {
    const result = runMembershipCampaign(campaignBudget)
    setCampaignResult({ success: result.success, boost: result.projectedMembersBoost })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Membership
          </CardTitle>
          <CardDescription>Track and grow your club's membership base</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {membershipData ? (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{membershipData.totalMembers.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Members</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">{membershipData.target.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Season Target</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${membershipData.trendLastSeason >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {membershipData.trendLastSeason >= 0 ? '+' : ''}{membershipData.trendLastSeason.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">vs Last Season</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Membership data will populate after your first season.</p>
          )}

          {isOffseason && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-muted-foreground" />
                <p className="font-medium text-sm">Run Membership Campaign</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Invest in marketing to boost membership numbers. Every $300k invested adds approximately 1,000 members.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Campaign Budget</span>
                  <span className="font-bold">{fmt(campaignBudget)}</span>
                </div>
                <Slider
                  min={100_000}
                  max={500_000}
                  step={50_000}
                  value={[campaignBudget]}
                  onValueChange={([v]) => { setCampaignBudget(v); setCampaignResult(null) }}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>$100K</span>
                  <span>$500K</span>
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-sm flex items-center justify-between">
                <span>Projected membership boost</span>
                <span className="font-bold text-green-600">+{projectedBoost.toLocaleString()} members</span>
              </div>
              {!canCampaign && balance < campaignBudget && (
                <div className="flex items-center gap-2 text-xs text-red-500">
                  <AlertTriangle className="w-3 h-3" />
                  Insufficient funds. Club balance: {fmt(balance)}
                </div>
              )}
              {campaignResult && (
                <div className={`flex items-center gap-2 text-sm p-2 rounded ${campaignResult.success ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300'}`}>
                  {campaignResult.success
                    ? `Campaign launched! Projected +${campaignResult.boost.toLocaleString()} new members.`
                    : 'Campaign failed. Check your club balance.'}
                </div>
              )}
              <Button
                onClick={handleCampaign}
                disabled={!canCampaign || campaignResult?.success === true}
                className="w-full"
              >
                <Megaphone className="w-4 h-4 mr-2" />
                {campaignResult?.success ? 'Campaign Running' : 'Launch Campaign'}
              </Button>
            </div>
          )}
          {!isOffseason && (
            <p className="text-xs text-muted-foreground pt-2">Membership campaigns can only be run during the offseason.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Handshake className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Sponsorship Deals</p>
                <p className="text-xs text-muted-foreground">
                  {club.sponsorshipDeals?.length ?? 0} active deal{club.sponsorshipDeals?.length !== 1 ? 's' : ''}
                  {sponsorshipOffers.length > 0 ? ` · ${sponsorshipOffers.length} new offer${sponsorshipOffers.length !== 1 ? 's' : ''} pending` : ''}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/sponsorship')}>
              Manage <ArrowRight className="w-3 h-3 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Budget tab
// ---------------------------------------------------------------------------

function BudgetTab({ clubId }: { clubId: string }) {
  const clubs = useGameStore((s) => s.clubs)
  const playersRecord = useGameStore((s) => s.players)
  const staffRecord = useGameStore((s) => s.staff)
  const players = useMemo(() => Object.values(playersRecord), [playersRecord])
  const staff = useMemo(() => Object.values(staffRecord), [staffRecord])
  const updateBudgetAllocation = useGameStore((s) => s.updateBudgetAllocation)

  const club = clubs[clubId]
  const [localAlloc, setLocalAlloc] = useState<ClubBudgetAllocation>(
    () => getClubBudgetAllocation(club),
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const budgetLines = useMemo(
    () => getDepartmentBudgetLines({ ...club, budgetAllocation: localAlloc }, players, staff),
    [club, localAlloc, players, staff],
  )

  const totalPct = BUDGET_DEPARTMENTS.reduce((s, d) => s + localAlloc[d], 0)
  const remainder = 100 - totalPct

  function handleSliderChange(dept: keyof ClubBudgetAllocation, value: number) {
    setLocalAlloc((prev) => ({ ...prev, [dept]: value }))
    setSaved(false)
    setError(null)
  }

  function handleStep(dept: keyof ClubBudgetAllocation, delta: number) {
    const newVal = Math.max(MIN_DEPARTMENT_PCT, Math.min(MAX_DEPARTMENT_PCT, localAlloc[dept] + delta))
    handleSliderChange(dept, newVal)
  }

  function handleSave() {
    const result = updateBudgetAllocation(localAlloc)
    if (result.success) {
      setSaved(true)
      setError(null)
      setTimeout(() => setSaved(false), 2500)
    } else {
      setError(result.error ?? 'Failed to save')
    }
  }

  function handleReset() {
    setLocalAlloc(getClubBudgetAllocation(club))
    setSaved(false)
    setError(null)
  }

  const effectLevelColor: Record<string, string> = {
    excellent: 'text-green-600 dark:text-green-400',
    good: 'text-blue-600 dark:text-blue-400',
    average: 'text-muted-foreground',
    poor: 'text-orange-500',
    critical: 'text-red-500',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Budget total</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${totalPct === 100 ? 'text-green-600' : 'text-red-500'}`}>
            {totalPct}%
          </span>
          {remainder !== 0 && (
            <Badge variant={remainder > 0 ? 'outline' : 'destructive'} className="text-xs">
              {remainder > 0 ? `${remainder}% unallocated` : `${Math.abs(remainder)}% over`}
            </Badge>
          )}
          {totalPct === 100 && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        </div>
      </div>

      <div className="space-y-3">
        {budgetLines.map((line) => {
          const Icon = ICON_MAP[line.icon] ?? DollarSign
          const dept = line.key as keyof ClubBudgetAllocation
          return (
            <Card key={line.key}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="flex-shrink-0 rounded-md p-1.5"
                      style={{ background: `${line.color}20` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: line.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{line.label}</p>
                      <p className="text-xs text-muted-foreground leading-tight line-clamp-1">{line.description}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-bold">{localAlloc[dept]}%</p>
                    <p className="text-xs text-muted-foreground">{fmt(line.dollarAmount, true)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStep(dept, -1)}
                    disabled={localAlloc[dept] <= MIN_DEPARTMENT_PCT}
                    className="flex-shrink-0 rounded p-0.5 hover:bg-muted disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <Slider
                    min={MIN_DEPARTMENT_PCT}
                    max={MAX_DEPARTMENT_PCT}
                    step={1}
                    value={[localAlloc[dept]]}
                    onValueChange={([v]) => handleSliderChange(dept, v)}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleStep(dept, 1)}
                    disabled={localAlloc[dept] >= MAX_DEPARTMENT_PCT}
                    className="flex-shrink-0 rounded p-0.5 hover:bg-muted disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={effectLevelColor[line.effectLevel]}>
                    {line.effectLevel.charAt(0).toUpperCase() + line.effectLevel.slice(1)} ({line.effectMultiplier.toFixed(2)}×)
                  </span>
                  <span className="text-muted-foreground truncate max-w-[55%] text-right">{line.primaryEffect}</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={handleReset}>Reset</Button>
        <Button size="sm" onClick={handleSave} disabled={totalPct !== 100}>
          {saved ? <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Saved</> : 'Save Budget'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Forecast tab
// ---------------------------------------------------------------------------

function ForecastTab({ clubId }: { clubId: string }) {
  const clubs = useGameStore((s) => s.clubs)
  const playersRecord = useGameStore((s) => s.players)
  const staffRecord = useGameStore((s) => s.staff)
  const players = useMemo(() => Object.values(playersRecord), [playersRecord])
  const staff = useMemo(() => Object.values(staffRecord), [staffRecord])

  const club = clubs[clubId]
  const projections = useMemo(() => generateProjections(club, players, staff, 4), [club, players, staff])

  const maxRevenue = Math.max(...projections.map((p) => p.projectedRevenue))
  const maxPnL = Math.max(...projections.map((p) => Math.abs(p.projectedPnL)))

  function BarRow({ label, value, max, colorClass }: { label: string; value: number; max: number; colorClass?: string }) {
    const pctW = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0
    return (
      <div className="grid grid-cols-[80px_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${colorClass ?? (value >= 0 ? 'bg-green-500' : 'bg-red-500')}`} style={{ width: `${pctW}%` }} />
          </div>
          <span className={`text-xs font-medium w-14 text-right ${value < 0 ? 'text-red-500' : ''}`}>
            {fmt(value, true)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Assumes 2.5% annual revenue growth and 3% salary growth. Actual results will vary.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 pr-4 text-left text-xs font-medium text-muted-foreground">Season</th>
              <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Revenue</th>
              <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Costs</th>
              <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Loans</th>
              <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">P&L</th>
              <th className="py-2 pl-2 text-right text-xs font-medium text-muted-foreground">Balance</th>
            </tr>
          </thead>
          <tbody>
            {projections.map((proj) => (
              <tr key={proj.yearOffset} className={`border-b ${proj.isDeficit ? 'bg-red-50/40 dark:bg-red-950/10' : ''}`}>
                <td className="py-2 pr-4 font-medium text-xs">{proj.label}</td>
                <td className="py-2 px-2 text-right text-xs">{fmt(proj.projectedRevenue, true)}</td>
                <td className="py-2 px-2 text-right text-xs">{fmt(proj.projectedExpenses, true)}</td>
                <td className="py-2 px-2 text-right text-xs text-orange-500">
                  {proj.projectedLoanRepayments + proj.projectedInterestCharges > 0
                    ? fmt(proj.projectedLoanRepayments + proj.projectedInterestCharges, true)
                    : '—'}
                </td>
                <td className={`py-2 px-2 text-right text-xs font-medium ${proj.isDeficit ? 'text-red-500' : 'text-green-600'}`}>
                  {proj.projectedPnL >= 0 ? '+' : ''}{fmt(proj.projectedPnL, true)}
                </td>
                <td className={`py-2 pl-2 text-right text-xs font-medium ${proj.cumulativeBalance < 0 ? 'text-red-500' : ''}`}>
                  {fmt(proj.cumulativeBalance, true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3">
        {projections.map((proj) => (
          <Card key={proj.yearOffset}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">{proj.label}</p>
                {proj.isDeficit && <Badge variant="destructive" className="text-xs">Deficit</Badge>}
              </div>
              <BarRow label="Revenue" value={proj.projectedRevenue} max={maxRevenue} colorClass="bg-primary" />
              <BarRow label="Expenses" value={proj.projectedExpenses} max={maxRevenue} colorClass="bg-muted-foreground/50" />
              {proj.projectedLoanRepayments + proj.projectedInterestCharges > 0 && (
                <BarRow label="Loan costs" value={proj.projectedLoanRepayments + proj.projectedInterestCharges} max={maxRevenue} colorClass="bg-orange-400" />
              )}
              <BarRow label="Net P&L" value={proj.projectedPnL} max={maxPnL} />
              {proj.assumptions.length > 0 && (
                <div className="pt-1 border-t space-y-0.5">
                  {proj.assumptions.map((a, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground">{a}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loans tab
// ---------------------------------------------------------------------------

function LoansTab({ clubId }: { clubId: string }) {
  const clubs = useGameStore((s) => s.clubs)
  const currentYear = useGameStore((s) => s.currentYear)
  const allowLoans = useGameStore((s) => s.settings.realism.allowLoans ?? true)
  const takeOutLoan = useGameStore((s) => s.takeOutLoan)
  const repayLoanEarly = useGameStore((s) => s.repayLoanEarly)

  const club = clubs[clubId]
  const activeLoans: ClubLoan[] = (club?.finances.loans ?? []).filter((l) => l.status === 'active')
  const paidLoans: ClubLoan[] = (club?.finances.loans ?? []).filter((l) => l.status === 'paid-off')

  const loanOptions = useMemo(
    () => getLoanOptions(club, currentYear, allowLoans),
    [club, currentYear, allowLoans],
  )

  const [selectedLender, setSelectedLender] = useState<string | null>(null)
  const [loanAmount, setLoanAmount] = useState<number>(0)
  const [loanError, setLoanError] = useState<string | null>(null)
  const [loanSuccess, setLoanSuccess] = useState<string | null>(null)
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null)

  const selectedOption = loanOptions.find((o) => o.lender === selectedLender)

  function handleTakeLoan() {
    if (!selectedOption) return
    if (loanAmount < selectedOption.minAmount || loanAmount > selectedOption.maxAmount) {
      setLoanError(`Amount must be between ${fmt(selectedOption.minAmount)} and ${fmt(selectedOption.maxAmount)}`)
      return
    }
    const result = takeOutLoan(
      selectedOption.lender,
      selectedOption.lenderName,
      loanAmount,
      selectedOption.annualInterestRate,
      selectedOption.termSeasons,
    )
    if (result.success) {
      setLoanSuccess(`${fmt(loanAmount, true)} loan from ${selectedOption.lenderName} approved.`)
      setLoanError(null)
      setSelectedLender(null)
      setLoanAmount(0)
      setTimeout(() => setLoanSuccess(null), 4000)
    } else {
      setLoanError(result.error ?? 'Loan request failed')
    }
  }

  function handleRepayEarly(loanId: string) {
    const result = repayLoanEarly(loanId)
    if (!result.success) {
      setLoanError(result.error ?? 'Could not repay loan')
    }
  }

  return (
    <div className="space-y-5">
      {loanSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm text-green-700 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {loanSuccess}
        </div>
      )}

      {/* Active loans */}
      {activeLoans.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Active Loans</h3>
          <div className="space-y-2">
            {activeLoans.map((loan) => {
              const annualCost = loan.annualPrincipalRepayment + Math.round(loan.remainingBalance * loan.annualInterestRate)
              return (
                <Card key={loan.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{loan.lenderName}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtPct(loan.annualInterestRate)} interest · {loan.seasonsRemaining} season{loan.seasonsRemaining !== 1 ? 's' : ''} remaining
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-orange-500">{fmt(loan.remainingBalance, true)}</p>
                        <p className="text-xs text-muted-foreground">remaining</p>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-400"
                        style={{ width: `${(loan.remainingBalance / loan.principalAmount) * 100}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Annual cost: <span className="font-medium text-foreground">{fmt(annualCost, true)}</span></span>
                      <button
                        type="button"
                        onClick={() => setExpandedLoan(expandedLoan === loan.id ? null : loan.id)}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        Details {expandedLoan === loan.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </div>
                    {expandedLoan === loan.id && (
                      <div className="mt-3 pt-3 border-t space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Principal borrowed</span>
                          <span>{fmt(loan.principalAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total interest paid</span>
                          <span>{fmt(loan.totalInterestPaid)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Est. payoff season</span>
                          <span>{loan.estimatedPayoffYear}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Taken out</span>
                          <span>{loan.takenOutYear}</span>
                        </div>
                        <div className="pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => handleRepayEarly(loan.id)}
                            disabled={(club?.finances.balance ?? 0) < loan.remainingBalance}
                          >
                            Repay in full ({fmt(loan.remainingBalance, true)})
                          </Button>
                          {(club?.finances.balance ?? 0) < loan.remainingBalance && (
                            <p className="mt-1 text-center text-[10px] text-muted-foreground">
                              Insufficient balance to repay in full
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
      {activeLoans.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">No active loans.</p>
      )}

      {/* Loan options */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Available Financing</h3>
        <div className="space-y-2">
          {loanOptions.map((opt) => (
            <Card
              key={opt.lender}
              className={`cursor-pointer border-2 transition-colors ${
                opt.available
                  ? selectedLender === opt.lender ? 'border-primary' : 'border-border hover:border-muted-foreground'
                  : 'opacity-50 cursor-not-allowed border-border'
              }`}
              onClick={() => {
                if (!opt.available) return
                setSelectedLender(selectedLender === opt.lender ? null : opt.lender)
                setLoanAmount(opt.minAmount)
                setLoanError(null)
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{opt.lenderName}</p>
                    <p className="text-xs text-muted-foreground">{opt.tagline}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold">{fmtPct(opt.annualInterestRate)}</p>
                    <p className="text-xs text-muted-foreground">{opt.termSeasons}yr term</p>
                  </div>
                </div>
                {!opt.available && opt.unavailableReason && (
                  <p className="mt-1.5 text-xs text-muted-foreground italic">{opt.unavailableReason}</p>
                )}
                {opt.available && selectedLender === opt.lender && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Range:</span>
                      <span>{fmt(opt.minAmount, true)} – {fmt(opt.maxAmount, true)}</span>
                    </div>
                    {opt.jobSecurityPenalty > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-orange-500">
                        <AlertTriangle className="h-3 w-3" />
                        <span>−{opt.jobSecurityPenalty} job security; −{opt.ongoingInstabilityPenalty} board instability/season</span>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span>Amount</span>
                        <span className="font-medium">{fmt(loanAmount, true)}</span>
                      </div>
                      <Slider
                        min={opt.minAmount}
                        max={opt.maxAmount}
                        step={500_000}
                        value={[loanAmount]}
                        onValueChange={([v]) => setLoanAmount(v)}
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{fmt(opt.minAmount, true)}</span>
                        <span>{fmt(opt.maxAmount, true)}</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Est. annual repayment: <span className="font-medium text-foreground">
                        {fmt(Math.round(loanAmount / opt.termSeasons) + Math.round(loanAmount * opt.annualInterestRate), true)}
                      </span>
                    </div>
                    {loanError && <p className="text-xs text-red-500">{loanError}</p>}
                    <Button size="sm" className="w-full" onClick={handleTakeLoan}>
                      Apply for Loan — {fmt(loanAmount, true)}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Paid-off history */}
      {paidLoans.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground">Loan History</h3>
          <div className="space-y-1.5">
            {paidLoans.map((loan) => (
              <div key={loan.id} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">{loan.lenderName} ({loan.takenOutYear}–{loan.estimatedPayoffYear})</span>
                <div>
                  <span className="font-medium">{fmt(loan.principalAmount, true)}</span>
                  <Badge variant="outline" className="ml-2 text-[10px]">Paid off</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function FinancesPage() {
  const { playerClubId, clubs } = useGameStore((s) => ({
    playerClubId: s.playerClubId,
    clubs: s.clubs,
  }))

  const club = clubs[playerClubId]
  if (!club) return null

  return (
    <div className="container max-w-5xl py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{club.name} Finances</h1>
        <p className="text-muted-foreground text-sm">Season finances, budget planning, and loans</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs">Revenue</TabsTrigger>
          <TabsTrigger value="expenses" className="text-xs">Expenses</TabsTrigger>
          <TabsTrigger value="membership" className="text-xs">Membership</TabsTrigger>
          <TabsTrigger value="budget" className="text-xs">Budget</TabsTrigger>
          <TabsTrigger value="forecast" className="text-xs">Forecast</TabsTrigger>
          <TabsTrigger value="loans" className="text-xs">Loans</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <OverviewTab clubId={playerClubId} />
        </TabsContent>

        <TabsContent value="revenue" className="space-y-3 mt-4">
          <RevenueTab clubId={playerClubId} />
        </TabsContent>

        <TabsContent value="expenses" className="space-y-3 mt-4">
          <ExpensesTab clubId={playerClubId} />
        </TabsContent>

        <TabsContent value="membership" className="space-y-4 mt-4">
          <MembershipTab clubId={playerClubId} />
        </TabsContent>

        <TabsContent value="budget" className="space-y-4 mt-4">
          <BudgetTab clubId={playerClubId} />
        </TabsContent>

        <TabsContent value="forecast" className="space-y-4 mt-4">
          <ForecastTab clubId={playerClubId} />
        </TabsContent>

        <TabsContent value="loans" className="space-y-4 mt-4">
          <LoansTab clubId={playerClubId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

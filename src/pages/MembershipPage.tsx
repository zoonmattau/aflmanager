import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import {
  TIER_CONFIGS,
  calculateTierMembershipRevenue,
  projectNextSeasonMembership,
  getPlayerStarRatingCountForClub,
} from '@/engine/clubs/membershipEngine'
import type { MembershipTierId, MembershipTierState } from '@/types/club'
import { Users, TrendingUp, TrendingDown, Minus, DollarSign, Target, Heart } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  return n.toLocaleString()
}

function fmtDollar(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${n}`
}

function TrendBadge({ delta }: { delta: number }) {
  if (delta > 0) return <Badge className="bg-green-100 text-green-800">+{fmt(delta)} <TrendingUp className="ml-1 h-3 w-3 inline" /></Badge>
  if (delta < 0) return <Badge className="bg-red-100 text-red-800">{fmt(delta)} <TrendingDown className="ml-1 h-3 w-3 inline" /></Badge>
  return <Badge variant="secondary"><Minus className="h-3 w-3 inline" /></Badge>
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const club = useGameStore((s) => playerClubId ? s.clubs[playerClubId] : null)
  const players = useGameStore((s) => s.players)
  const ladder = useGameStore((s) => s.ladder)

  if (!club?.finances.membershipState) {
    return <p className="text-muted-foreground p-4">No membership data available.</p>
  }

  const ms = club.finances.membershipState
  const totalMembers = ms.tiers.reduce((s, t) => s + t.count, 0)
  const totalRevenue = calculateTierMembershipRevenue(ms.tiers)
  const starCount = playerClubId ? getPlayerStarRatingCountForClub(players, playerClubId) : 0
  const ladderIdx = ladder.findIndex((e) => e.clubId === playerClubId)
  const ladderPos = ladderIdx >= 0 ? ladderIdx + 1 : 9
  const projection = projectNextSeasonMembership(ms, ladderPos, starCount)

  const trendPct = ms.trendLastSeason !== 0 && totalMembers > 0
    ? ((ms.trendLastSeason / (totalMembers - ms.trendLastSeason)) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> Total Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalMembers)}</p>
            <p className="text-xs text-muted-foreground">Target: {fmt(ms.seasonTarget)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> Membership Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtDollar(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground">Annual projected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> YoY Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <TrendBadge delta={ms.trendLastSeason} />
            </div>
            <p className="text-xs text-muted-foreground">{trendPct}% vs last season</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Heart className="h-3 w-3" /> Fan Satisfaction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{ms.fanSatisfaction}/100</p>
            <div className="mt-1 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${ms.fanSatisfaction}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Membership Tiers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 pr-4 text-right">Price</th>
                  <th className="py-2 pr-4 text-right">Members</th>
                  <th className="py-2 pr-4 text-right">Revenue</th>
                  <th className="py-2 text-right">Trend</th>
                </tr>
              </thead>
              <tbody>
                {ms.tiers.map((tier) => {
                  const config = TIER_CONFIGS.find((c) => c.id === tier.tierId)
                  const rev = tier.price * tier.count
                  const delta = tier.count - tier.lastSeasonCount
                  return (
                    <tr key={tier.tierId} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{config?.label ?? tier.tierId}</td>
                      <td className="py-2 pr-4 text-right">${fmt(tier.price)}</td>
                      <td className="py-2 pr-4 text-right">{fmt(tier.count)}</td>
                      <td className="py-2 pr-4 text-right">{fmtDollar(rev)}</td>
                      <td className="py-2 text-right"><TrendBadge delta={delta} /></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="pt-3 pr-4">Total</td>
                  <td />
                  <td className="pt-3 pr-4 text-right">{fmt(totalMembers)}</td>
                  <td className="pt-3 pr-4 text-right">{fmtDollar(totalRevenue)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Projection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" /> Next Season Projection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Low</p>
              <p className="text-xl font-bold text-red-600">{fmt(projection.low)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Base</p>
              <p className="text-xl font-bold text-primary">{fmt(projection.mid)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">High</p>
              <p className="text-xl font-bold text-green-600">{fmt(projection.high)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Based on current ladder position ({ladderPos}), fan satisfaction, and campaign budget.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Manage Tab
// ---------------------------------------------------------------------------

function ManageTab() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const club = useGameStore((s) => playerClubId ? s.clubs[playerClubId] : null)
  const setMembershipTierPrice = useGameStore((s) => s.setMembershipTierPrice)
  const setMembershipCampaignBudget = useGameStore((s) => s.setMembershipCampaignBudget)
  const setMembershipSeasonTarget = useGameStore((s) => s.setMembershipSeasonTarget)

  const ms = club?.finances.membershipState
  const [localTiers, setLocalTiers] = useState<MembershipTierState[]>(ms?.tiers ?? [])
  const [localBudget, setLocalBudget] = useState(ms?.campaignBudget ?? 50_000)
  const [localTarget, setLocalTarget] = useState(ms?.seasonTarget ?? 30_000)
  const [saved, setSaved] = useState(false)

  if (!playerClubId || !ms) {
    return <p className="text-muted-foreground p-4">No membership data available.</p>
  }

  const previewRevenue = localTiers.reduce((s, t) => s + t.price * t.count, 0)
  const currentRevenue = calculateTierMembershipRevenue(ms.tiers)
  const revenueDelta = previewRevenue - currentRevenue

  function handlePriceChange(tierId: MembershipTierId, value: number) {
    setLocalTiers((prev) => prev.map((t) => t.tierId === tierId ? { ...t, price: value } : t))
    setSaved(false)
  }

  function handleApply() {
    for (const tier of localTiers) {
      setMembershipTierPrice(playerClubId, tier.tierId, tier.price)
    }
    setMembershipCampaignBudget(playerClubId, localBudget)
    setMembershipSeasonTarget(playerClubId, localTarget)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Campaign acquisition multiplier preview
  const campaignMultiplierPreview = localBudget <= 0
    ? 0.5
    : Math.min(2.0, 0.5 + (Math.log10(localBudget / 10_000)) * 0.55)

  return (
    <div className="space-y-6">
      {/* Revenue preview banner */}
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex items-center justify-between py-3">
          <p className="text-sm font-medium">Preview Annual Revenue</p>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold">{fmtDollar(previewRevenue)}</span>
            {revenueDelta !== 0 && (
              <Badge className={revenueDelta > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                {revenueDelta > 0 ? '+' : ''}{fmtDollar(revenueDelta)}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tier price sliders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tier Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {localTiers.map((tier) => {
            const config = TIER_CONFIGS.find((c) => c.id === tier.tierId)
            if (!config) return null
            const tierRevPreview = tier.price * tier.count
            return (
              <div key={tier.tierId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">{config.label}</Label>
                  <span className="text-sm text-muted-foreground">{fmt(tier.count)} members → {fmtDollar(tierRevPreview)}/yr</span>
                </div>
                <p className="text-xs text-muted-foreground">{config.description}</p>
                <div className="flex items-center gap-4">
                  <Slider
                    min={config.minPrice}
                    max={config.maxPrice}
                    step={5}
                    value={[tier.price]}
                    onValueChange={([v]) => handlePriceChange(tier.tierId, v)}
                    className="flex-1"
                  />
                  <span className="w-20 text-right font-mono text-sm">${fmt(tier.price)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Min ${fmt(config.minPrice)}</span>
                  <span>Default ${fmt(config.basePrice)}</span>
                  <span>Max ${fmt(config.maxPrice)}</span>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Campaign budget */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Campaign Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Campaign spend drives new member acquisition. Higher spend yields a higher acquisition multiplier (up to 2×).
          </p>
          <div className="flex items-center gap-4">
            <Slider
              min={0}
              max={500_000}
              step={5_000}
              value={[localBudget]}
              onValueChange={([v]) => { setLocalBudget(v); setSaved(false) }}
              className="flex-1"
            />
            <span className="w-24 text-right font-mono text-sm">{fmtDollar(localBudget)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Acquisition multiplier: <strong>{campaignMultiplierPreview.toFixed(2)}×</strong>
          </p>
        </CardContent>
      </Card>

      {/* Season target */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Season Target</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Set a total membership target to track progress toward.</p>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              value={localTarget}
              onChange={(e) => { setLocalTarget(Number(e.target.value)); setSaved(false) }}
              className="w-40"
              min={0}
            />
            <span className="text-sm text-muted-foreground">members</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleApply}>Apply Changes</Button>
        {saved && <span className="text-sm text-green-600">Changes saved!</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// History Tab
// ---------------------------------------------------------------------------

function HistoryTab() {
  const playerClubId = useGameStore((s) => s.playerClubId)
  const ms = useGameStore((s) =>
    playerClubId ? s.clubs[playerClubId]?.finances.membershipState : null,
  )

  if (!ms || ms.history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Users className="h-10 w-10 opacity-30" />
        <p className="text-sm">No membership history yet. Complete your first season to see historical data.</p>
      </div>
    )
  }

  const maxTotal = Math.max(...ms.history.map((h) => h.total))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Membership History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Year</th>
                  <th className="py-2 pr-4 text-right">Total Members</th>
                  <th className="py-2 pr-4 text-right">Revenue</th>
                  <th className="py-2 text-right">Net Change</th>
                </tr>
              </thead>
              <tbody>
                {[...ms.history].reverse().map((entry, idx, arr) => {
                  const prev = arr[idx + 1]
                  const delta = prev != null ? entry.total - prev.total : null
                  return (
                    <tr key={entry.year} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{entry.year}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 rounded-full bg-primary opacity-60"
                            style={{ width: `${Math.round((entry.total / maxTotal) * 100)}px` }} />
                          {fmt(entry.total)}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right">{fmtDollar(entry.revenue)}</td>
                      <td className="py-2 text-right">
                        {delta != null ? <TrendBadge delta={delta} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function MembershipPage() {
  return (
    <div className="container max-w-4xl py-6 space-y-4">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Membership</h1>
          <p className="text-sm text-muted-foreground">Manage your club's membership tiers, pricing, and campaigns.</p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="manage">Manage</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="manage" className="mt-4">
          <ManageTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

import { useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { SponsorshipDeal, SponsorshipOffer, SponsorshipSlot } from '@/types/club'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Handshake, Lock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLOT_LABELS: Record<SponsorshipSlot, string> = {
  major: 'Major',
  guernsey: 'Guernsey',
  stadium: 'Stadium',
  digital: 'Digital',
}

const SLOT_ORDER: SponsorshipSlot[] = ['major', 'stadium', 'guernsey', 'digital']

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount}`
}

function satisfactionColor(sat: number): string {
  if (sat >= 70) return 'bg-green-500'
  if (sat >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

// ---------------------------------------------------------------------------
// Counter dialog
// ---------------------------------------------------------------------------

interface CounterDialogProps {
  offer: SponsorshipOffer
  open: boolean
  onClose: () => void
  onSubmit: (value: number, years: number) => void
}

function CounterDialog({ offer, open, onClose, onSubmit }: CounterDialogProps) {
  const [value, setValue] = useState(offer.annualValue)
  const [years, setYears] = useState(offer.years)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Counter offer — {offer.companyName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Original: {formatMoney(offer.annualValue)} / yr × {offer.years} yr
          </p>
          <div className="space-y-2">
            <Label htmlFor="counter-value">Annual value ($)</Label>
            <Input
              id="counter-value"
              type="number"
              step={50_000}
              min={0}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="counter-years">Term (years)</Label>
            <Input
              id="counter-years"
              type="number"
              min={1}
              max={7}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit(value, years)}>Submit counter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Slot card (active deal or empty)
// ---------------------------------------------------------------------------

interface SlotCardProps {
  slot: SponsorshipSlot
  deal: SponsorshipDeal | undefined
  onTerminate: (dealId: string) => void
}

function SlotCard({ slot, deal, onTerminate }: SlotCardProps) {
  if (!deal) {
    return (
      <Card className="border-dashed opacity-60">
        <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
          <Handshake className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">{SLOT_LABELS[slot]} Sponsor</p>
          <p className="text-xs text-muted-foreground">No sponsor</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">{SLOT_LABELS[slot]}</Badge>
          {deal.exclusiveCategory && (
            <Badge variant="outline" className="text-xs">
              Exclusive: {deal.exclusiveCategory}
            </Badge>
          )}
        </div>
        <CardTitle className="text-base">{deal.companyName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Annual value</span>
          <span className="font-semibold">{formatMoney(deal.annualValue)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Years remaining</span>
          <span>{deal.yearsRemaining} / {deal.totalYears}</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Satisfaction</span>
            <span>{deal.satisfaction}</span>
          </div>
          <div className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full">
            <div
              className={`h-full transition-all ${satisfactionColor(deal.satisfaction)}`}
              style={{ width: `${deal.satisfaction}%` }}
            />
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => onTerminate(deal.id)}
        >
          Terminate deal
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Offer row
// ---------------------------------------------------------------------------

interface OfferRowProps {
  offer: SponsorshipOffer
  fanSatisfaction: number
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onCounter: (offer: SponsorshipOffer) => void
}

function OfferRow({ offer, fanSatisfaction, onAccept, onReject, onCounter }: OfferRowProps) {
  const locked = offer.reputationRequirement !== undefined && fanSatisfaction < offer.reputationRequirement
  const counterRejected = offer.counterStatus === 'rejected'

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${counterRejected ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{offer.companyName}</span>
            <Badge variant="outline" className="text-xs">{SLOT_LABELS[offer.slot]}</Badge>
            {offer.exclusiveCategory && (
              <Badge variant="secondary" className="text-xs">Excl. {offer.exclusiveCategory}</Badge>
            )}
            {counterRejected && (
              <Badge variant="destructive" className="text-xs">Counter rejected</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span>{formatMoney(offer.annualValue)} / yr</span>
            <span>{offer.years} yr</span>
            <span className="text-green-600">+{formatMoney(offer.performanceBonus)} bonus</span>
            {offer.reputationRequirement !== undefined && (
              <span className={`flex items-center gap-1 ${locked ? 'text-amber-600' : ''}`}>
                <Lock className="h-3 w-3" />
                Fan satisfaction ≥ {offer.reputationRequirement}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {locked ? (
            <div className="flex items-center gap-1 text-amber-600 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Ineligible</span>
            </div>
          ) : (
            <Button size="sm" onClick={() => onAccept(offer.id)}>Accept</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onCounter(offer)}>Counter</Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onReject(offer.id)}>
            Reject
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SponsorshipPage() {
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const sponsorshipOffers = useGameStore((s) => s.sponsorshipOffers)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const club = useGameStore((s) => s.clubs[s.playerClubId])
  const acceptSponsorshipOffer = useGameStore((s) => s.acceptSponsorshipOffer)
  const rejectSponsorshipOffer = useGameStore((s) => s.rejectSponsorshipOffer)
  const counterSponsorshipOffer = useGameStore((s) => s.counterSponsorshipOffer)
  const terminateSponsorshipDeal = useGameStore((s) => s.terminateSponsorshipDeal)

  const [counterTarget, setCounterTarget] = useState<SponsorshipOffer | null>(null)

  const deals = club?.sponsorshipDeals ?? []
  const fanSatisfaction = club?.fanSatisfaction ?? 60

  // Filter offers to this club only
  const clubOffers = sponsorshipOffers.filter((o) => o.clubId === playerClubId)

  const notify = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 3000)
  }

  const handleAccept = (offerId: string) => {
    const result = acceptSponsorshipOffer(offerId)
    if (result && !result.success) {
      notify('error', result.error ?? 'Cannot accept offer')
    } else {
      notify('success', 'Sponsorship deal signed!')
    }
  }

  const handleReject = (offerId: string) => {
    rejectSponsorshipOffer(offerId)
    notify('success', 'Offer rejected')
  }

  const handleCounter = (offer: SponsorshipOffer) => {
    setCounterTarget(offer)
  }

  const handleCounterSubmit = (value: number, years: number) => {
    if (!counterTarget) return
    const { result } = counterSponsorshipOffer(counterTarget.id, value, years)
    setCounterTarget(null)
    if (result === 'accepted') {
      notify('success', 'Counter offer accepted — deal signed!')
    } else {
      notify('error', 'Counter rejected by sponsor')
    }
  }

  const handleTerminate = (dealId: string) => {
    terminateSponsorshipDeal(dealId)
    notify('success', 'Deal terminated')
  }

  const totalRevenue = deals.reduce((sum, d) => sum + d.annualValue, 0)

  if (!club) {
    return <div className="p-6 text-muted-foreground">No club selected.</div>
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sponsorship</h1>
          <p className="text-muted-foreground text-sm">
            {deals.length} active deal{deals.length !== 1 ? 's' : ''} · Total {formatMoney(totalRevenue)} / yr
          </p>
        </div>
        <Handshake className="h-8 w-8 text-muted-foreground" />
      </div>

      {statusMsg && (
        <div className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${
          statusMsg.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {statusMsg.text}
        </div>
      )}

      {/* Section 1: Active Deals — 4 slot cards */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Active Deals</h2>
        <div className="grid grid-cols-2 gap-4">
          {SLOT_ORDER.map((slot) => {
            const deal = deals.find((d) => d.slot === slot)
            return (
              <SlotCard
                key={slot}
                slot={slot}
                deal={deal}
                onTerminate={handleTerminate}
              />
            )
          })}
        </div>
      </section>

      {/* Section 2: Pending Offers */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Pending Offers</h2>
        {clubOffers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No sponsorship offers at this time. Offers are generated at the end of each season.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {clubOffers.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                fanSatisfaction={fanSatisfaction}
                onAccept={handleAccept}
                onReject={handleReject}
                onCounter={handleCounter}
              />
            ))}
          </div>
        )}
      </section>

      {/* Section 3: Active deal summary table */}
      {deals.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Deal Summary</h2>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 px-4 font-medium">Company</th>
                    <th className="py-2 px-4 font-medium">Slot</th>
                    <th className="py-2 px-4 font-medium">Annual Value</th>
                    <th className="py-2 px-4 font-medium">Term</th>
                    <th className="py-2 px-4 font-medium">Signed</th>
                    <th className="py-2 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal) => (
                    <tr key={deal.id} className="border-b last:border-0">
                      <td className="py-2 px-4 font-medium">{deal.companyName}</td>
                      <td className="py-2 px-4">
                        <Badge variant="secondary" className="text-xs">{SLOT_LABELS[deal.slot]}</Badge>
                      </td>
                      <td className="py-2 px-4">{formatMoney(deal.annualValue)}</td>
                      <td className="py-2 px-4">{deal.totalYears} yr</td>
                      <td className="py-2 px-4">{deal.signedYear}</td>
                      <td className="py-2 px-4">
                        <Badge variant={deal.yearsRemaining > 0 ? 'default' : 'outline'} className="text-xs">
                          Active · {deal.yearsRemaining} yr left
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Counter dialog */}
      {counterTarget && (
        <CounterDialog
          offer={counterTarget}
          open={true}
          onClose={() => setCounterTarget(null)}
          onSubmit={handleCounterSubmit}
        />
      )}
    </div>
  )
}

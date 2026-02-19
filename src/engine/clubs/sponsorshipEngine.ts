import type { Club, SponsorshipDeal, SponsorshipOffer, SponsorshipCategory, SponsorshipSlot } from '@/types/club'
import type { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Company name pools per category
// ---------------------------------------------------------------------------

export const SPONSOR_COMPANIES: Record<SponsorshipCategory, string[]> = {
  telecoms:   ['ConnectAus', 'TeleLink', 'Optix', 'NexTel', 'SkyNet Mobile', 'Velocity Wireless'],
  automotive: ['AutoNation', 'DriveAus', 'Peak Motors', 'Summit Auto', 'Southern Roads', 'Crestline Cars'],
  beer:       ["Rocky's Ale", 'Crisp Lager', 'Gold Tap Brewing', 'Southern Cross Beer', 'Frontier Ales', "Mick's Draught"],
  finance:    ['Southern Trust Bank', 'CapVest', 'Apex Financial', 'Cornerstone Wealth', 'BlueChip Bank', 'Navigator Finance'],
  insurance:  ['Secure Life', 'Shield Protect', 'SafeGuard Insurance', 'All-Star Cover', 'SafeHaven', 'PremiumProtect'],
  retail:     ['ShopMax', 'BrightMart', 'ValuePlus', 'MegaStore', 'AllGoods', 'FreshDeal Retail'],
  tech:       ['TechPeak', 'DataFlow', 'InnovateTech', 'DigitalEdge', 'SmartSystems', 'CodeBridge'],
  energy:     ['PowerGrid Energy', 'SunForce', 'GreenWatt', 'EcoEnergy', 'BlastFurnace Power', 'Clean Energy Co'],
  travel:     ['FlyHigh Airlines', 'SkyRoute Travel', 'GlobeTrek', 'FastTrack Holidays', 'Voyager Air', 'DirectFlight'],
  food:       ['Graze & Go', 'FreshBite', 'BigEat Foods', 'Nourish Co', 'QuickServe', 'ProvenFood'],
}

// ---------------------------------------------------------------------------
// Slot value ranges
// ---------------------------------------------------------------------------

export const SLOT_VALUE_RANGES: Record<SponsorshipSlot, { min: number; max: number; years: [number, number] }> = {
  major:    { min: 3_000_000, max: 6_000_000, years: [3, 5] },
  stadium:  { min: 2_000_000, max: 4_000_000, years: [3, 5] },
  guernsey: { min: 1_000_000, max: 2_500_000, years: [2, 4] },
  digital:  { min: 300_000,   max: 1_000_000, years: [1, 3] },
}

const ALL_SLOTS: SponsorshipSlot[] = ['major', 'guernsey', 'stadium', 'digital']

const ALL_CATEGORIES: SponsorshipCategory[] = [
  'telecoms', 'automotive', 'beer', 'finance', 'insurance',
  'retail', 'tech', 'energy', 'travel', 'food',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandomCompany(category: SponsorshipCategory, rng: SeededRNG): string {
  const companies = SPONSOR_COMPANIES[category]
  return companies[rng.nextInt(0, companies.length - 1)]
}

function pickRandomCategory(exclude: SponsorshipCategory[], rng: SeededRNG): SponsorshipCategory {
  const available = ALL_CATEGORIES.filter((c) => !exclude.includes(c))
  if (available.length === 0) return ALL_CATEGORIES[rng.nextInt(0, ALL_CATEGORIES.length - 1)]
  return available[rng.nextInt(0, available.length - 1)]
}

function computeOfferValue(
  slot: SponsorshipSlot,
  club: Club,
  fanSatisfaction: number | undefined,
  rng: SeededRNG,
): number {
  const range = SLOT_VALUE_RANGES[slot]
  const base = rng.nextInt(range.min, range.max)
  const tierMult = club.tier === 'large' ? 1.3 : club.tier === 'medium' ? 1.0 : 0.7
  const fan = fanSatisfaction ?? 60
  const fanMult = fan > 70 ? 1.15 : fan < 40 ? 0.80 : 1.0
  const variance = 1.0 + rng.nextFloat(-0.10, 0.10)
  return Math.round((base * tierMult * fanMult * variance) / 10_000) * 10_000
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Generate sponsorship offers for a club at the start of the offseason.
 * For each of the 4 slots, if no active deal exists or the deal expires this year,
 * generate 1–2 offers for that slot.
 */
export function generateSponsorshipOffers(
  club: Club,
  currentDeals: SponsorshipDeal[],
  year: number,
  rng: SeededRNG,
): SponsorshipOffer[] {
  const offers: SponsorshipOffer[] = []
  const usedCategories: SponsorshipCategory[] = []

  for (const slot of ALL_SLOTS) {
    const activeDeal = currentDeals.find((d) => d.slot === slot)
    // Skip if there's an active deal with more than 1 year remaining
    if (activeDeal && activeDeal.yearsRemaining > 1) continue

    const offerCount = rng.nextInt(1, 2)
    for (let i = 0; i < offerCount; i++) {
      const cat = pickRandomCategory(usedCategories, rng)
      usedCategories.push(cat)

      const annualValue = computeOfferValue(slot, club, club.fanSatisfaction, rng)
      const range = SLOT_VALUE_RANGES[slot]
      const years = rng.nextInt(range.years[0], range.years[1])

      const bonusRate = slot === 'major' || slot === 'stadium' ? 0.15
        : slot === 'guernsey' ? 0.10
        : 0.08
      const performanceBonus = Math.round((annualValue * bonusRate) / 10_000) * 10_000

      // 40% chance of reputation requirement for major/stadium
      let reputationRequirement: number | undefined
      if ((slot === 'major' || slot === 'stadium') && rng.chance(0.4)) {
        reputationRequirement = 65
      }

      // 25% chance of exclusive category for major/stadium
      let exclusiveCategory: SponsorshipCategory | undefined
      if ((slot === 'major' || slot === 'stadium') && rng.chance(0.25)) {
        exclusiveCategory = cat
      }

      offers.push({
        id: crypto.randomUUID(),
        clubId: club.id,
        companyName: pickRandomCompany(cat, rng),
        tier: slot === 'major' ? 'naming-rights' : slot === 'stadium' ? 'major' : slot === 'guernsey' ? 'secondary' : 'minor',
        category: cat,
        annualValue,
        years,
        performanceBonus,
        expiresYear: year + 1,
        slot,
        reputationRequirement,
        exclusiveCategory,
      })
    }
  }

  return offers
}

/**
 * Process yearly renewal: decrement yearsRemaining, remove expired deals.
 */
export function processYearlyRenewal(deals: SponsorshipDeal[]): SponsorshipDeal[] {
  return deals
    .map((d) => ({ ...d, yearsRemaining: d.yearsRemaining - 1 }))
    .filter((d) => d.yearsRemaining > 0)
}

/**
 * Update satisfaction for all active deals based on season performance.
 */
export function updateSponsorSatisfaction(
  deals: SponsorshipDeal[],
  ladderPosition: number,
  fanSatisfaction: number,
): SponsorshipDeal[] {
  return deals.map((deal) => {
    let delta = 0
    if (ladderPosition <= 4) delta += 10
    else if (ladderPosition <= 8) delta += 5
    else if (ladderPosition >= 14) delta -= 10

    if (fanSatisfaction > 70) delta += 5
    else if (fanSatisfaction < 40) delta -= 5

    const newSatisfaction = Math.max(0, Math.min(100, deal.satisfaction + delta))
    return { ...deal, satisfaction: newSatisfaction }
  })
}

/**
 * Resolve a counter-offer.
 * Accepted if counterValue >= offer.annualValue * 0.85 AND counterYears >= ceil(offer.years * 0.75).
 * Adds ±5% RNG variance.
 */
export function resolveSponsorCounter(
  offer: SponsorshipOffer,
  counterValue: number,
  counterYears: number,
  rng: SeededRNG,
): 'accepted' | 'rejected' {
  const minValue = offer.annualValue * 0.85
  const minYears = Math.ceil(offer.years * 0.75)

  // RNG variance: ±5% — using chance to add a small random shift
  const variance = rng.chance(0.5) ? 1.05 : 0.95
  const effectiveMin = minValue * variance

  if (counterValue >= effectiveMin && counterYears >= minYears) {
    return 'accepted'
  }
  return 'rejected'
}

/**
 * Returns deals with yearsRemaining === 1 (expiring at end of this season).
 */
export function getExpiringDeals(deals: SponsorshipDeal[]): SponsorshipDeal[] {
  return deals.filter((d) => d.yearsRemaining === 1)
}

/**
 * Get total annual sponsorship revenue from all active deals.
 * If isTop4, performance bonuses are included.
 */
export function getSponsorshipTotalRevenue(
  deals: SponsorshipDeal[],
  isTop4: boolean,
): number {
  return deals.reduce(
    (sum, d) => sum + d.annualValue + (isTop4 ? d.performanceBonus : 0),
    0,
  )
}

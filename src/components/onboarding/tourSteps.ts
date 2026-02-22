/**
 * Onboarding coachmark tour — step definitions.
 *
 * Each step targets a sidebar nav link via a CSS selector and displays a
 * spotlight highlight + tooltip card. Padding is applied uniformly around
 * the bounding rect of the matched element.
 */

export interface TourStep {
  title: string
  body: string
  /** CSS selector used to find the element to highlight */
  targetSelector: string
  /** Extra px around the bounding rect for the spotlight ring */
  padding: number
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Your Dashboard',
    body: "Your home base — today's fixture, recent form, club finances, and inbox alerts all in one view. Start every session here.",
    targetSelector: 'aside a[href="/"]',
    padding: 6,
  },
  {
    title: 'Your Squad',
    body: 'Every player on your list lives here. Check overall ratings, contracts, positions, and morale before each round.',
    targetSelector: 'aside a[href="/squad"]',
    padding: 6,
  },
  {
    title: 'Shape Your List',
    body: 'Use Trades to negotiate with rival clubs and Contracts to lock in your best players before the free-agency window opens.',
    targetSelector: 'aside a[href="/trades"]',
    padding: 6,
  },
  {
    title: 'Club Finances',
    body: 'Revenue funds facilities. Facilities drive player development. Keep an eye on your salary cap — exceeding it has consequences.',
    targetSelector: 'aside a[href="/finances"]',
    padding: 6,
  },
]

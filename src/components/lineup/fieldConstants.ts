import type { LineupSlot } from '@/types/player'

// ---------------------------------------------------------------------------
// Shared slot-position type used by FootballField, MatchupFieldPreview, and
// OppositionOverlay.
// ---------------------------------------------------------------------------

export interface SlotPosition {
  slot: LineupSlot
  label: string
  /** Percentage of container height (0-100) */
  top: number
  /** Percentage of container width (0-100) */
  left: number
}

// ---------------------------------------------------------------------------
// On-field slot positions — 18 positions as % of the 540×700 SVG container
//
// Conversion from SVG coords: left = x/540 × 100, top = y/700 × 100
// Scale: ~3.93 px/m (530px ÷ 135m width, 650px ÷ 165m height)
// ---------------------------------------------------------------------------

export const FIELD_SLOTS: SlotPosition[] = [
  // Back line
  { slot: 'FB',  label: 'FB',  top: 7.9,  left: 50.0 },
  { slot: 'LBP', label: 'LBP', top: 10.7, left: 32.4 },
  { slot: 'RBP', label: 'RBP', top: 10.7, left: 67.6 },

  // Half-back line
  { slot: 'CHB', label: 'CHB', top: 25.7, left: 50.0 },
  { slot: 'LHB', label: 'LHB', top: 25.7, left: 23.1 },
  { slot: 'RHB', label: 'RHB', top: 25.7, left: 76.9 },

  // Followers
  { slot: 'RK',  label: 'RK',  top: 42.9, left: 50.0 },
  { slot: 'RR',  label: 'RR',  top: 44.3, left: 38.9 },
  { slot: 'ROV', label: 'ROV', top: 44.3, left: 61.1 },

  // Centre line
  { slot: 'LW', label: 'LW', top: 50.0, left: 15.7 },
  { slot: 'C',  label: 'C',  top: 50.0, left: 50.0 },
  { slot: 'RW', label: 'RW', top: 50.0, left: 84.3 },

  // Half-forward line
  { slot: 'CHF', label: 'CHF', top: 74.3, left: 50.0 },
  { slot: 'LHF', label: 'LHF', top: 74.3, left: 23.1 },
  { slot: 'RHF', label: 'RHF', top: 74.3, left: 76.9 },

  // Forward line
  { slot: 'FF',  label: 'FF',  top: 92.1, left: 50.0 },
  { slot: 'LFP', label: 'LFP', top: 89.3, left: 32.4 },
  { slot: 'RFP', label: 'RFP', top: 89.3, left: 67.6 },
]

// ---------------------------------------------------------------------------
// Opposition mirroring — maps each slot to the opponent slot that lines up
// against it (e.g. user LBP is defended by opp RFP).
// ---------------------------------------------------------------------------

export const OPPOSITE_SLOT: Record<LineupSlot, LineupSlot> = {
  LBP: 'RFP',
  FB: 'FF',
  RBP: 'LFP',
  LHB: 'RHF',
  CHB: 'CHF',
  RHB: 'LHF',
  LW: 'RW',
  C: 'C',
  RW: 'LW',
  RK: 'RK',
  RR: 'ROV',
  ROV: 'RR',
  LHF: 'RHB',
  CHF: 'CHB',
  RHF: 'LHB',
  LFP: 'RBP',
  FF: 'FB',
  RFP: 'LBP',
  I1: 'I1',
  I2: 'I2',
  I3: 'I3',
  I4: 'I4',
  I5: 'I5',
  I6: 'I6',
  I7: 'I7',
  I8: 'I8',
}

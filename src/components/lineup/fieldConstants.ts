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
// On-field slot positions — portrait 540×700 container
//
// Conversion from SVG coords: left = x/540 × 100, top = y/700 × 100
// Scale: ~3.93 px/m (530px ÷ 135m width, 650px ÷ 165m height)
// ---------------------------------------------------------------------------

export const FIELD_SLOTS: SlotPosition[] = [
  // Back line
  { slot: 'FB',  label: 'FB',  top: 7.9,  left: 50.0 },
  { slot: 'LBP', label: 'LBP', top: 13.5, left: 31.5 },
  { slot: 'RBP', label: 'RBP', top: 13.5, left: 68.5 },

  // Half-back line
  { slot: 'CHB', label: 'CHB', top: 25.7, left: 50.0 },
  { slot: 'LHB', label: 'LHB', top: 25.7, left: 23.1 },
  { slot: 'RHB', label: 'RHB', top: 25.7, left: 76.9 },

  // Centre square roles (wider 2x2 square around centre-circle origin)
  { slot: 'RK',  label: 'RK',  top: 40.5, left: 38.5 },
  { slot: 'RR',  label: 'RR',  top: 40.5, left: 61.5 },
  { slot: 'ROV', label: 'ROV', top: 59.5, left: 38.5 },
  { slot: 'LW',  label: 'LW',  top: 50.0, left: 15.7 },
  { slot: 'C',   label: 'C',   top: 59.5, left: 61.5 },
  { slot: 'RW',  label: 'RW',  top: 50.0, left: 84.3 },

  // Half-forward line
  { slot: 'CHF', label: 'CHF', top: 74.3, left: 50.0 },
  { slot: 'LHF', label: 'LHF', top: 74.3, left: 23.1 },
  { slot: 'RHF', label: 'RHF', top: 74.3, left: 76.9 },

  // Forward line
  { slot: 'FF',  label: 'FF',  top: 92.1, left: 50.0 },
  { slot: 'LFP', label: 'LFP', top: 86.5, left: 31.5 },
  { slot: 'RFP', label: 'RFP', top: 86.5, left: 68.5 },
]

// ---------------------------------------------------------------------------
// Landscape slot positions — 700×540 container (field rotated 90° CW)
// Derived: new_left = 100 - portrait_top, new_top = portrait_left
// ---------------------------------------------------------------------------

export const FIELD_SLOTS_LANDSCAPE: SlotPosition[] = [
  // Back line (left side in landscape — defending end)
  { slot: 'FB',  label: 'FB',  top: 50.0, left: 7.9  },
  { slot: 'LBP', label: 'LBP', top: 31.5, left: 13.5 },
  { slot: 'RBP', label: 'RBP', top: 68.5, left: 13.5 },

  // Half-back line
  { slot: 'CHB', label: 'CHB', top: 50.0, left: 25.7 },
  { slot: 'LHB', label: 'LHB', top: 23.1, left: 30.0 },
  { slot: 'RHB', label: 'RHB', top: 76.9, left: 30.0 },

  // Centre square roles
  { slot: 'RK',  label: 'RK',  top: 38.5, left: 40.5 },
  { slot: 'RR',  label: 'RR',  top: 61.5, left: 40.5 },
  { slot: 'ROV', label: 'ROV', top: 38.5, left: 59.5 },
  { slot: 'LW',  label: 'LW',  top: 15.7, left: 50.0 },
  { slot: 'C',   label: 'C',   top: 61.5, left: 59.5 },
  { slot: 'RW',  label: 'RW',  top: 84.3, left: 50.0 },

  // Half-forward line
  { slot: 'CHF', label: 'CHF', top: 50.0, left: 74.3 },
  { slot: 'LHF', label: 'LHF', top: 23.1, left: 70.0 },
  { slot: 'RHF', label: 'RHF', top: 76.9, left: 70.0 },

  // Forward line (right side in landscape — attacking end toward bench)
  { slot: 'FF',  label: 'FF',  top: 50.0, left: 92.1 },
  { slot: 'LFP', label: 'LFP', top: 31.5, left: 86.5 },
  { slot: 'RFP', label: 'RFP', top: 68.5, left: 86.5 },
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

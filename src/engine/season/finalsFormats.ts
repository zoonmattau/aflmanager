/**
 * Preset finals format definitions.
 *
 * Each format is fully data-driven — the finals engine interprets these
 * definitions to generate fixtures, resolve matchups, and determine the premier.
 */

import type { FinalsFormat } from '@/types/finals'

// ── AFL Top 8 (current AFL system) ──────────────────────────────────────────

const aflTop8: FinalsFormat = {
  id: 'afl-top-8',
  name: 'AFL Top 8',
  description: 'The current AFL finals system. Top 8 qualify, with qualifying and elimination finals giving top 4 a double chance.',
  qualifyingTeams: 8,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Finals Week 1',
      matchups: [
        {
          label: 'QF1',
          finalType: 'QF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 4 },
          isElimination: false,
        },
        {
          label: 'EF1',
          finalType: 'EF',
          home: { type: 'ladder', rank: 5 },
          away: { type: 'ladder', rank: 8 },
          isElimination: true,
        },
        {
          label: 'QF2',
          finalType: 'QF',
          home: { type: 'ladder', rank: 2 },
          away: { type: 'ladder', rank: 3 },
          isElimination: false,
        },
        {
          label: 'EF2',
          finalType: 'EF',
          home: { type: 'ladder', rank: 6 },
          away: { type: 'ladder', rank: 7 },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Finals Week 2',
      matchups: [
        {
          label: 'SF1',
          finalType: 'SF',
          home: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'loser' },
          away: { type: 'result', weekRef: 1, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'SF2',
          finalType: 'SF',
          home: { type: 'result', weekRef: 1, matchRef: 2, outcome: 'loser' },
          away: { type: 'result', weekRef: 1, matchRef: 3, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Finals Week 3',
      matchups: [
        {
          label: 'PF1',
          finalType: 'PF',
          home: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 2, matchRef: 0, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'PF2',
          finalType: 'PF',
          home: { type: 'result', weekRef: 1, matchRef: 2, outcome: 'winner' },
          away: { type: 'result', weekRef: 2, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 4,
      label: 'Grand Final',
      matchups: [
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'result', weekRef: 3, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 3, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── Page-McIntyre Top 4 ─────────────────────────────────────────────────────

const pageMcIntyreTop4: FinalsFormat = {
  id: 'page-mcintyre-top-4',
  name: 'Page-McIntyre Top 4',
  description: 'Classic 4-team finals. 1st vs 2nd (double chance), 3rd vs 4th (elimination), then preliminary and grand final.',
  qualifyingTeams: 4,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Finals Week 1',
      matchups: [
        {
          label: 'QF',
          finalType: 'QF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 2 },
          isElimination: false,
        },
        {
          label: 'EF',
          finalType: 'EF',
          home: { type: 'ladder', rank: 3 },
          away: { type: 'ladder', rank: 4 },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Preliminary Final',
      matchups: [
        {
          label: 'PF',
          finalType: 'PF',
          home: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'loser' },
          away: { type: 'result', weekRef: 1, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Grand Final',
      matchups: [
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 2, matchRef: 0, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── Top 6 ─────────────────────────────────────────────────────────────────

const top6: FinalsFormat = {
  id: 'top-6',
  name: 'Top 6',
  description: 'Six teams qualify. Top 2 get a bye to week 2, then semis, prelims, and grand final.',
  qualifyingTeams: 6,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Elimination Finals',
      matchups: [
        {
          label: 'EF1',
          finalType: 'EF',
          home: { type: 'ladder', rank: 3 },
          away: { type: 'ladder', rank: 6 },
          isElimination: true,
        },
        {
          label: 'EF2',
          finalType: 'EF',
          home: { type: 'ladder', rank: 4 },
          away: { type: 'ladder', rank: 5 },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Semi Finals',
      matchups: [
        {
          label: 'SF1',
          finalType: 'SF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'SF2',
          finalType: 'SF',
          home: { type: 'ladder', rank: 2 },
          away: { type: 'result', weekRef: 1, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Grand Final',
      matchups: [
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'result', weekRef: 2, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 2, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── Straight Knockout ──────────────────────────────────────────────────────

const straightKnockout: FinalsFormat = {
  id: 'straight-knockout',
  name: 'Straight Knockout',
  description: 'Top 8 play sudden-death knockout. No double chances — lose and you are out.',
  qualifyingTeams: 8,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Quarter Finals',
      matchups: [
        {
          label: 'QF1',
          finalType: 'QF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 8 },
          isElimination: true,
        },
        {
          label: 'QF2',
          finalType: 'QF',
          home: { type: 'ladder', rank: 2 },
          away: { type: 'ladder', rank: 7 },
          isElimination: true,
        },
        {
          label: 'QF3',
          finalType: 'QF',
          home: { type: 'ladder', rank: 3 },
          away: { type: 'ladder', rank: 6 },
          isElimination: true,
        },
        {
          label: 'QF4',
          finalType: 'QF',
          home: { type: 'ladder', rank: 4 },
          away: { type: 'ladder', rank: 5 },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Semi Finals',
      matchups: [
        {
          label: 'SF1',
          finalType: 'SF',
          home: { type: 'result', weekRef: 1, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 1, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
        {
          label: 'SF2',
          finalType: 'SF',
          home: { type: 'result', weekRef: 1, matchRef: 2, outcome: 'winner' },
          away: { type: 'result', weekRef: 1, matchRef: 3, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Grand Final',
      matchups: [
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'result', weekRef: 2, matchRef: 0, outcome: 'winner' },
          away: { type: 'result', weekRef: 2, matchRef: 1, outcome: 'winner' },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── Round Robin ─────────────────────────────────────────────────────────────

const roundRobin: FinalsFormat = {
  id: 'round-robin',
  name: 'Round Robin Top 4',
  description: 'Top 4 play each other once, then the top 2 from the round-robin play the Grand Final.',
  qualifyingTeams: 4,
  grandFinalVenue: 'MCG',
  weeks: [
    {
      weekNumber: 1,
      label: 'Round Robin Week 1',
      matchups: [
        {
          label: 'RR1',
          finalType: 'SF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 4 },
          isElimination: false,
        },
        {
          label: 'RR2',
          finalType: 'SF',
          home: { type: 'ladder', rank: 2 },
          away: { type: 'ladder', rank: 3 },
          isElimination: false,
        },
      ],
    },
    {
      weekNumber: 2,
      label: 'Round Robin Week 2',
      matchups: [
        {
          label: 'RR3',
          finalType: 'SF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 3 },
          isElimination: false,
        },
        {
          label: 'RR4',
          finalType: 'SF',
          home: { type: 'ladder', rank: 2 },
          away: { type: 'ladder', rank: 4 },
          isElimination: false,
        },
      ],
    },
    {
      weekNumber: 3,
      label: 'Round Robin Week 3',
      matchups: [
        {
          label: 'RR5',
          finalType: 'SF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 2 },
          isElimination: false,
        },
        {
          label: 'RR6',
          finalType: 'SF',
          home: { type: 'ladder', rank: 3 },
          away: { type: 'ladder', rank: 4 },
          isElimination: false,
        },
      ],
    },
    {
      weekNumber: 4,
      label: 'Grand Final',
      matchups: [
        // For round-robin, the GF is between the top 2 ranked after the round-robin.
        // The engine resolves this via a special "round-robin standings" calculation.
        // We use ladder rank 1 & 2 as placeholders — the engine will re-rank after RR.
        {
          label: 'GF',
          finalType: 'GF',
          home: { type: 'ladder', rank: 1 },
          away: { type: 'ladder', rank: 2 },
          isElimination: true,
        },
      ],
    },
  ],
}

// ── Exports ────────────────────────────────────────────────────────────────

export const FINALS_FORMATS: FinalsFormat[] = [
  aflTop8,
  pageMcIntyreTop4,
  top6,
  straightKnockout,
  roundRobin,
]

export function getFinalsFormatById(id: string, customFormat?: FinalsFormat): FinalsFormat {
  if (id === 'custom' && customFormat) return customFormat
  return FINALS_FORMATS.find((f) => f.id === id) ?? aflTop8
}

import type { SpecialEventDefinition, SpecialEventId } from '@/types/specialEvents'

export const SPECIAL_EVENT_DEFINITIONS: SpecialEventDefinition[] = [
  {
    id: 'international-rules',
    name: 'International Rules Series',
    description: 'Australia vs Ireland hybrid-rules series played after the AFL season',
    defaultEnabled: true,
    timing: 'post-season',
    matchCount: 2,
    defaultVenues: ['MCG', 'Adelaide Oval'],
    teamComposition: 'international',
  },
  {
    id: 'state-of-origin',
    name: 'State of Origin',
    description: 'Representative matches between state-based teams during the mid-season bye',
    defaultEnabled: true,
    timing: 'mid-season',
    matchCount: 3,
    defaultVenues: ['MCG', 'Adelaide Oval', 'Optus Stadium'],
    teamComposition: 'representative',
  },
  {
    id: 'aboriginal-all-stars',
    name: 'Aboriginal All Stars',
    description: 'Showcase match celebrating Indigenous players in the AFL',
    defaultEnabled: true,
    timing: 'preseason',
    matchCount: 1,
    defaultVenues: ['MCG'],
    teamComposition: 'all-star',
  },
  {
    id: 'preseason-showcase',
    name: 'Preseason Showcase',
    description: 'Exhibition matches between representative teams before the season starts',
    defaultEnabled: true,
    timing: 'preseason',
    matchCount: 2,
    defaultVenues: ['Marvel Stadium', 'Gabba'],
    teamComposition: 'representative',
  },
  {
    id: 'all-australian-vs-rest',
    name: 'All-Australian vs Rest',
    description: 'The best 22 players take on the next best after the season concludes',
    defaultEnabled: true,
    timing: 'post-season',
    matchCount: 1,
    defaultVenues: ['MCG'],
    teamComposition: 'all-star',
  },
]

export function getEventDefinition(id: SpecialEventId): SpecialEventDefinition | undefined {
  return SPECIAL_EVENT_DEFINITIONS.find((d) => d.id === id)
}

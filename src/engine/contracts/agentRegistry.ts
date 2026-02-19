import type { AgentProfile } from '@/types/agent'
import type { Player, AgentArchetype } from '@/types/player'

// ---------------------------------------------------------------------------
// Static agent pool — 8 per archetype (48 total)
// ---------------------------------------------------------------------------

const AGENTS: AgentProfile[] = [
  // loyal
  { id: 'ag_loyal_1', name: 'Tim Hartley',     archetype: 'loyal', baseLoyaltyBias:  8, baseGreedBias: -3 },
  { id: 'ag_loyal_2', name: 'Sarah McKinley',  archetype: 'loyal', baseLoyaltyBias:  7, baseGreedBias: -2 },
  { id: 'ag_loyal_3', name: 'Peter Drummond',  archetype: 'loyal', baseLoyaltyBias:  9, baseGreedBias: -4 },
  { id: 'ag_loyal_4', name: 'Claire Fenton',   archetype: 'loyal', baseLoyaltyBias:  6, baseGreedBias: -1 },
  { id: 'ag_loyal_5', name: 'Michael Torres',  archetype: 'loyal', baseLoyaltyBias:  8, baseGreedBias: -3 },
  { id: 'ag_loyal_6', name: 'Rebecca Nash',    archetype: 'loyal', baseLoyaltyBias:  7, baseGreedBias: -2 },
  { id: 'ag_loyal_7', name: 'Grant Sullivan',  archetype: 'loyal', baseLoyaltyBias:  9, baseGreedBias: -5 },
  { id: 'ag_loyal_8', name: 'Diana Pearce',    archetype: 'loyal', baseLoyaltyBias:  6, baseGreedBias: -1 },

  // greedy
  { id: 'ag_greedy_1', name: 'Marcus Vance',   archetype: 'greedy', baseLoyaltyBias: -4, baseGreedBias:  8 },
  { id: 'ag_greedy_2', name: 'Tara Westbrook', archetype: 'greedy', baseLoyaltyBias: -3, baseGreedBias:  7 },
  { id: 'ag_greedy_3', name: 'Craig Lawson',   archetype: 'greedy', baseLoyaltyBias: -5, baseGreedBias:  9 },
  { id: 'ag_greedy_4', name: 'Nicole Shaw',    archetype: 'greedy', baseLoyaltyBias: -2, baseGreedBias:  6 },
  { id: 'ag_greedy_5', name: 'David Crane',    archetype: 'greedy', baseLoyaltyBias: -4, baseGreedBias:  8 },
  { id: 'ag_greedy_6', name: 'Fiona Marsh',    archetype: 'greedy', baseLoyaltyBias: -3, baseGreedBias:  7 },
  { id: 'ag_greedy_7', name: 'Justin Carr',    archetype: 'greedy', baseLoyaltyBias: -6, baseGreedBias: 10 },
  { id: 'ag_greedy_8', name: 'Leanne Cross',   archetype: 'greedy', baseLoyaltyBias: -2, baseGreedBias:  6 },

  // premiership-chaser
  { id: 'ag_prem_1', name: 'Anthony Delaney', archetype: 'premiership-chaser', baseLoyaltyBias:  2, baseGreedBias: -1 },
  { id: 'ag_prem_2', name: 'Julia Kane',       archetype: 'premiership-chaser', baseLoyaltyBias:  3, baseGreedBias:  0 },
  { id: 'ag_prem_3', name: 'Scott Briggs',     archetype: 'premiership-chaser', baseLoyaltyBias:  1, baseGreedBias: -2 },
  { id: 'ag_prem_4', name: 'Helen Tanner',     archetype: 'premiership-chaser', baseLoyaltyBias:  2, baseGreedBias:  1 },
  { id: 'ag_prem_5', name: 'Rod Fletcher',     archetype: 'premiership-chaser', baseLoyaltyBias:  0, baseGreedBias: -1 },
  { id: 'ag_prem_6', name: 'Kerry Booth',      archetype: 'premiership-chaser', baseLoyaltyBias:  1, baseGreedBias:  0 },
  { id: 'ag_prem_7', name: 'Dean Hollis',      archetype: 'premiership-chaser', baseLoyaltyBias:  3, baseGreedBias: -2 },
  { id: 'ag_prem_8', name: 'Annette Ward',     archetype: 'premiership-chaser', baseLoyaltyBias:  2, baseGreedBias:  1 },

  // homebody
  { id: 'ag_home_1', name: 'Brian Locke',      archetype: 'homebody', baseLoyaltyBias:  5, baseGreedBias: -2 },
  { id: 'ag_home_2', name: 'Sandra Morris',    archetype: 'homebody', baseLoyaltyBias:  6, baseGreedBias: -3 },
  { id: 'ag_home_3', name: 'Wayne Gifford',    archetype: 'homebody', baseLoyaltyBias:  4, baseGreedBias: -1 },
  { id: 'ag_home_4', name: 'Christine Doyle',  archetype: 'homebody', baseLoyaltyBias:  5, baseGreedBias: -2 },
  { id: 'ag_home_5', name: 'Paul Shannon',     archetype: 'homebody', baseLoyaltyBias:  7, baseGreedBias: -4 },
  { id: 'ag_home_6', name: 'Alison Burke',     archetype: 'homebody', baseLoyaltyBias:  4, baseGreedBias: -1 },
  { id: 'ag_home_7', name: 'Terry Mills',      archetype: 'homebody', baseLoyaltyBias:  6, baseGreedBias: -3 },
  { id: 'ag_home_8', name: 'Natalie Cox',      archetype: 'homebody', baseLoyaltyBias:  5, baseGreedBias: -2 },

  // mercenary
  { id: 'ag_merc_1', name: 'Victor Sloane',    archetype: 'mercenary', baseLoyaltyBias: -7, baseGreedBias:  6 },
  { id: 'ag_merc_2', name: 'Amanda Price',     archetype: 'mercenary', baseLoyaltyBias: -5, baseGreedBias:  5 },
  { id: 'ag_merc_3', name: 'Frank Adler',      archetype: 'mercenary', baseLoyaltyBias: -8, baseGreedBias:  7 },
  { id: 'ag_merc_4', name: 'Cynthia Ray',      archetype: 'mercenary', baseLoyaltyBias: -6, baseGreedBias:  6 },
  { id: 'ag_merc_5', name: 'Larry Stone',      archetype: 'mercenary', baseLoyaltyBias: -7, baseGreedBias:  7 },
  { id: 'ag_merc_6', name: 'Donna Holt',       archetype: 'mercenary', baseLoyaltyBias: -5, baseGreedBias:  5 },
  { id: 'ag_merc_7', name: 'Eric Quinn',       archetype: 'mercenary', baseLoyaltyBias: -9, baseGreedBias:  8 },
  { id: 'ag_merc_8', name: 'Sharon West',      archetype: 'mercenary', baseLoyaltyBias: -6, baseGreedBias:  6 },

  // risk-averse
  { id: 'ag_risk_1', name: 'James Owens',      archetype: 'risk-averse', baseLoyaltyBias:  3, baseGreedBias: -4 },
  { id: 'ag_risk_2', name: 'Kathryn Bell',     archetype: 'risk-averse', baseLoyaltyBias:  2, baseGreedBias: -3 },
  { id: 'ag_risk_3', name: 'Norman Webb',      archetype: 'risk-averse', baseLoyaltyBias:  4, baseGreedBias: -5 },
  { id: 'ag_risk_4', name: 'Pamela Cole',      archetype: 'risk-averse', baseLoyaltyBias:  3, baseGreedBias: -4 },
  { id: 'ag_risk_5', name: 'Steve Harvey',     archetype: 'risk-averse', baseLoyaltyBias:  2, baseGreedBias: -3 },
  { id: 'ag_risk_6', name: 'Louise Day',       archetype: 'risk-averse', baseLoyaltyBias:  4, baseGreedBias: -5 },
  { id: 'ag_risk_7', name: 'George Pope',      archetype: 'risk-averse', baseLoyaltyBias:  3, baseGreedBias: -4 },
  { id: 'ag_risk_8', name: 'Irene Fox',        archetype: 'risk-averse', baseLoyaltyBias:  2, baseGreedBias: -3 },
]

const AGENTS_BY_ARCHETYPE: Record<AgentArchetype, AgentProfile[]> = {
  loyal:                AGENTS.filter(a => a.archetype === 'loyal'),
  greedy:               AGENTS.filter(a => a.archetype === 'greedy'),
  'premiership-chaser': AGENTS.filter(a => a.archetype === 'premiership-chaser'),
  homebody:             AGENTS.filter(a => a.archetype === 'homebody'),
  mercenary:            AGENTS.filter(a => a.archetype === 'mercenary'),
  'risk-averse':        AGENTS.filter(a => a.archetype === 'risk-averse'),
}

export function getAgentById(agentId: string): AgentProfile | undefined {
  return AGENTS.find(a => a.id === agentId)
}

export function getAllAgents(): AgentProfile[] {
  return AGENTS
}

export function getAgentsByArchetype(archetype: AgentArchetype): AgentProfile[] {
  return AGENTS_BY_ARCHETYPE[archetype] ?? []
}

/**
 * Deterministically assign an agent to a player based on their ID.
 * Always returns the same agent for a given player — no RNG required.
 */
export function assignAgentToPlayer(player: Player): string {
  const archetype = player.agentArchetype
  if (!archetype) return AGENTS[0].id
  const pool = AGENTS_BY_ARCHETYPE[archetype]
  const hash = player.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return pool[hash % pool.length].id
}

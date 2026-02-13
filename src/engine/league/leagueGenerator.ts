import { SeededRNG } from '@/engine/core/rng'
import type { Club, ClubFacilities, ClubFinances, ClubGameplan, ClubColors } from '@/types/club'

// ---------------------------------------------------------------------------
// Word lists for procedural name generation
// ---------------------------------------------------------------------------

const CITIES = [
  'Northbridge', 'Southport', 'Eastwood', 'Westfield', 'Springfield',
  'Lakewood', 'Ashford', 'Riverton', 'Clarkton', 'Moreland',
  'Danbury', 'Elston', 'Fairhaven', 'Greystone', 'Harrington',
  'Ironwood', 'Jasperdale', 'Kingsford', 'Linton', 'Maplewood',
  'Newbury', 'Oakdale', 'Pinehurst', 'Redmond', 'Stonehill',
]

const MASCOTS = [
  'Hawks', 'Wolves', 'Bears', 'Eagles', 'Sharks',
  'Panthers', 'Cobras', 'Foxes', 'Stallions', 'Vipers',
  'Raptors', 'Scorpions', 'Falcons', 'Jaguars', 'Hornets',
  'Mustangs', 'Coyotes', 'Ravens', 'Bulls', 'Thunderbolts',
  'Storm', 'Titans', 'Knights', 'Wildcats', 'Bombers',
]

const GROUNDS = [
  'Stadium', 'Arena', 'Oval', 'Park', 'Field',
  'Dome', 'Centre', 'Ground', 'Coliseum', 'Reserve',
]

const PRIMARY_COLORS = [
  '#1e3a5f', '#8b0000', '#006400', '#4B0082', '#FF8C00',
  '#2F4F4F', '#800080', '#008B8B', '#B8860B', '#DC143C',
  '#191970', '#556B2F', '#8B4513', '#483D8B', '#2E8B57',
  '#6B8E23', '#4682B4', '#CD853F', '#6A5ACD', '#708090',
  '#9B111E', '#00416A', '#014421', '#7B3F00', '#4A0000',
]

const SECONDARY_COLORS = [
  '#FFD700', '#FFFFFF', '#C0C0C0', '#FFA500', '#87CEEB',
  '#F0E68C', '#E6E6FA', '#FFDAB9', '#98FB98', '#FFB6C1',
  '#B0C4DE', '#DDA0DD', '#F5DEB3', '#AFEEEE', '#D2B48C',
  '#E0FFFF', '#FFE4E1', '#F0FFF0', '#FFFACD', '#F5F5DC',
  '#FAEBD7', '#FFF8DC', '#F0F8FF', '#FFFFF0', '#FFF5EE',
]

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function generateClubName(rng: SeededRNG, usedCities: Set<string>, usedMascots: Set<string>): { city: string; mascot: string } {
  let city: string
  let mascot: string

  // Pick unused city
  const availableCities = CITIES.filter((c) => !usedCities.has(c))
  city = availableCities.length > 0
    ? availableCities[rng.intBetween(0, availableCities.length - 1)]
    : CITIES[rng.intBetween(0, CITIES.length - 1)]

  // Pick unused mascot
  const availableMascots = MASCOTS.filter((m) => !usedMascots.has(m))
  mascot = availableMascots.length > 0
    ? availableMascots[rng.intBetween(0, availableMascots.length - 1)]
    : MASCOTS[rng.intBetween(0, MASCOTS.length - 1)]

  return { city, mascot }
}

function generateColors(rng: SeededRNG, usedPrimaries: Set<string>): ClubColors {
  const availablePrimaries = PRIMARY_COLORS.filter((c) => !usedPrimaries.has(c))
  const primary = availablePrimaries.length > 0
    ? availablePrimaries[rng.intBetween(0, availablePrimaries.length - 1)]
    : PRIMARY_COLORS[rng.intBetween(0, PRIMARY_COLORS.length - 1)]

  const secondary = SECONDARY_COLORS[rng.intBetween(0, SECONDARY_COLORS.length - 1)]

  return { primary, secondary }
}

function generateFacilities(rng: SeededRNG): ClubFacilities {
  return {
    trainingGround: rng.intBetween(1, 4),
    gym: rng.intBetween(1, 4),
    medicalCentre: rng.intBetween(1, 4),
    recoveryPool: rng.intBetween(1, 3),
    analysisSuite: rng.intBetween(1, 3),
    youthAcademy: rng.intBetween(1, 3),
  }
}

function generateFinances(rng: SeededRNG): ClubFinances {
  const salaryCap = 15_500_000
  return {
    salaryCap,
    currentSpend: rng.intBetween(10_000_000, 15_000_000),
    revenue: rng.intBetween(14_000_000, 20_000_000),
    expenses: rng.intBetween(12_000_000, 18_000_000),
    balance: rng.intBetween(2_000_000, 10_000_000),
  }
}

function generateGameplan(rng: SeededRNG): ClubGameplan {
  const pick = <T>(arr: T[]): T => arr[rng.intBetween(0, arr.length - 1)]
  return {
    offensiveStyle: pick(['attacking', 'balanced', 'defensive'] as const),
    tempo: pick(['fast', 'medium', 'slow'] as const),
    aggression: pick(['high', 'medium', 'low'] as const),
    kickInTactic: pick(['play-on-short', 'play-on-long', 'set-up-short', 'set-up-long'] as const),
    centreTactic: pick(['spread', 'cluster', 'balanced'] as const),
    stoppageTactic: pick(['spread', 'cluster', 'balanced'] as const),
    defensiveLine: pick(['press', 'hold', 'run', 'zone'] as const),
    midfieldLine: pick(['press', 'hold', 'run', 'zone'] as const),
    forwardLine: pick(['press', 'hold', 'run', 'zone'] as const),
    ruckNomination: {
      primaryRuckId: null,
      backupRuckId: null,
      aroundTheGround: false,
    },
    rotations: pick(['low', 'medium', 'high'] as const),
  }
}

/**
 * Generate a fictional league with the given number of teams.
 */
export function generateFictionalLeague(teamCount: number, seed: number): Club[] {
  const rng = new SeededRNG(seed)
  const clubs: Club[] = []
  const usedCities = new Set<string>()
  const usedMascots = new Set<string>()
  const usedPrimaries = new Set<string>()

  for (let i = 0; i < teamCount; i++) {
    const { city, mascot } = generateClubName(rng, usedCities, usedMascots)
    usedCities.add(city)
    usedMascots.add(mascot)

    const colors = generateColors(rng, usedPrimaries)
    usedPrimaries.add(colors.primary)

    const groundSuffix = GROUNDS[rng.intBetween(0, GROUNDS.length - 1)]
    const homeGround = `${city} ${groundSuffix}`

    const id = `fictional-${city.toLowerCase().replace(/\s+/g, '-')}`
    const abbreviation = city.slice(0, 4).toUpperCase()

    const club: Club = {
      id,
      name: city,
      fullName: `${city} ${mascot}`,
      abbreviation,
      mascot,
      homeGround,
      colors,
      facilities: generateFacilities(rng),
      finances: generateFinances(rng),
      draftPicks: [
        { year: 2026, round: 1, originalClubId: id, currentClubId: id },
        { year: 2026, round: 2, originalClubId: id, currentClubId: id },
        { year: 2026, round: 3, originalClubId: id, currentClubId: id },
      ],
      gameplan: generateGameplan(rng),
      aiPersonality: {
        competitiveWindow: (['win-now', 'balanced', 'rebuilding'] as const)[rng.intBetween(0, 2)],
        draftPhilosophy: (['best-available', 'positional-need', 'high-upside'] as const)[rng.intBetween(0, 2)],
        riskTolerance: (['aggressive', 'moderate', 'conservative'] as const)[rng.intBetween(0, 2)],
        tradeActivity: (['active', 'moderate', 'passive'] as const)[rng.intBetween(0, 2)],
      },
    }

    clubs.push(club)
  }

  return clubs
}

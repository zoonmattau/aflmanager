/**
 * Real AFL/VFL club historical data and season records.
 * Loaded into game state when a new game uses the real AFL clubs configuration.
 */
import type { SeasonRecord } from '@/types/history'

// ---------------------------------------------------------------------------
// Club historical profile type
// ---------------------------------------------------------------------------

export interface ClubHistoricalData {
  /** VFL + AFL premiership years (all-time) */
  premiershipYears: number[]
  /** Grand Final appearances that were losses */
  grandFinalLossYears: number[]
  /** Short narrative lore (2–3 sentences) */
  clubLore: string
  /** All-time legendary players (4–6 names) */
  legendaryPlayers: string[]
  /** Club IDs of traditional rivals */
  traditionalRivalClubIds: string[]
  /** Year the club joined the AFL (may differ from VFL founding) */
  aflDebut: number
  /** Previous name(s) if applicable */
  formerNames?: string[]
}

// ---------------------------------------------------------------------------
// Per-club historical profiles
// ---------------------------------------------------------------------------

export const CLUB_HISTORICAL_DATA: Record<string, ClubHistoricalData> = {
  adelaide: {
    premiershipYears: [1997, 1998],
    grandFinalLossYears: [2017],
    aflDebut: 1991,
    clubLore:
      'South Australia\'s first AFL club, the Crows burst onto the national stage as an expansion side in 1991 and wasted little time making their mark. Back-to-back premierships in 1997 and 1998 announced Adelaide as a powerhouse of the modern era. The club draws its fierce identity from the Showdown rivalry with Port Adelaide, one of the most intense derbies in Australian sport.',
    legendaryPlayers: ['Andrew McLeod', 'Mark Bickley', 'Mark Ricciuto', 'Darren Jarman', 'Matthew Nicks', 'Tony McGuinness'],
    traditionalRivalClubIds: ['portadelaide'],
  },

  brisbane: {
    premiershipYears: [2001, 2002, 2003, 2024],
    grandFinalLossYears: [2004, 2023],
    aflDebut: 1997,
    formerNames: ['Brisbane Bears (1987–1996)', 'Fitzroy Lions (VFL, merged 1996)'],
    clubLore:
      'Formed from the merger of the Brisbane Bears and the proud Fitzroy Lions in 1996, the Lions quickly rose to become the AFL\'s dominant force at the turn of the millennium. Three consecutive premierships from 2001 to 2003 — a feat unmatched in the AFL era — cemented their status as legends. After nearly two decades in the wilderness, the Lions reclaimed the flag in 2024 to complete one of football\'s great redemption arcs.',
    legendaryPlayers: ['Michael Voss', 'Simon Black', 'Jason Akermanis', 'Jonathan Brown', 'Dayne Zorko', 'Lachie Neale'],
    traditionalRivalClubIds: ['goldcoast', 'richmond'],
  },

  carlton: {
    premiershipYears: [1906, 1907, 1908, 1914, 1938, 1945, 1947, 1968, 1970, 1972, 1979, 1981, 1982, 1987, 1995, 1906],
    grandFinalLossYears: [1932, 1969, 1993, 1999],
    aflDebut: 1897,
    clubLore:
      'One of the foundation clubs of the VFL, Carlton\'s navy blue has cast a long shadow over Australian football history. The Blues share the record for most VFL/AFL premierships and were the powerhouse of the 1970s and 1980s under coach David Parkin and legendary players like Alex Jesaulenko and Wayne Johnston. Although the flag drought since 1995 has tested supporters\' patience, Carlton\'s history and supporter base remain among the competition\'s grandest.',
    legendaryPlayers: ['Alex Jesaulenko', 'John Nicholls', 'Bruce Doull', 'Wayne Johnston', 'Stephen Kernahan', 'Craig Bradley'],
    traditionalRivalClubIds: ['collingwood', 'essendon', 'richmond'],
  },

  collingwood: {
    premiershipYears: [1927, 1928, 1929, 1930, 1935, 1936, 1953, 1958, 1990, 2010, 2023],
    grandFinalLossYears: [1977, 1979, 1980, 1981, 2002, 2003, 2011, 2018],
    aflDebut: 1897,
    clubLore:
      'No club in Australian football commands the same combination of passion, history and controversy as the Collingwood Magpies. With a supporter base unlike any other and a record-equalling premiership tally, the Pies have been central to the game\'s biggest moments for over a century. The black and white is synonymous with fierce competition, whether winning flags under legendary coaches or making dramatic Grand Final runs only to come up short.',
    legendaryPlayers: ['Lou Richards', 'Peter Daicos', 'Tony Shaw', 'Mick McGuane', 'Scott Pendlebury', 'Dane Swan', 'Nick Daicos'],
    traditionalRivalClubIds: ['carlton', 'essendon', 'richmond'],
  },

  essendon: {
    premiershipYears: [1897, 1901, 1946, 1949, 1950, 1962, 1965, 1984, 1985, 1993, 2000],
    grandFinalLossYears: [1941, 1983, 2001],
    aflDebut: 1897,
    clubLore:
      'The Bombers are one of the most decorated clubs in the history of Australian Rules football, sharing the record for most VFL/AFL premierships. Essendon has produced some of the game\'s greatest players across every era, from the dynasties of the 1940s and 1960s through to James Hird\'s brilliant early-2000s era. Despite turbulent years in the 2010s, the red sash remains a symbol of excellence and tradition at the MCG.',
    legendaryPlayers: ['Dick Reynolds', 'Tim Watson', 'James Hird', 'Matthew Lloyd', 'Michael Long', 'Dustin Fletcher'],
    traditionalRivalClubIds: ['carlton', 'collingwood'],
  },

  fremantle: {
    premiershipYears: [],
    grandFinalLossYears: [2013],
    aflDebut: 1995,
    clubLore:
      'The Fremantle Dockers arrived in the AFL in 1995 as West Australia\'s second team, giving the state a passionate derby rival for the established West Coast Eagles. Building steadily through the 2000s under coach Mark Harvey and later Michael Walters\'s era, Fremantle reached their only Grand Final in 2013, falling narrowly to Hawthorn. The club\'s purple and white has become a vibrant part of Perth\'s sporting identity.',
    legendaryPlayers: ['Matthew Pavlich', 'Aaron Sandilands', 'David Mundy', 'Nat Fyfe', 'Stephen Hill', 'Andrew Brayshaw'],
    traditionalRivalClubIds: ['westcoast'],
  },

  geelong: {
    premiershipYears: [1925, 1931, 1937, 1951, 1952, 1963, 2007, 2009, 2011, 2022],
    grandFinalLossYears: [1992, 1994, 1995, 2008],
    aflDebut: 1897,
    clubLore:
      'Geelong is Australia\'s greatest country football club and one of the VFL/AFL\'s most decorated. The Cats\' late-2000s dynasty — three premierships from 2007 to 2011 — produced some of the finest football ever played, driven by an extraordinary core of champions. Their 2022 premiership, built around experienced veterans, demonstrated that Geelong\'s culture of excellence transcends eras and generations.',
    legendaryPlayers: ['Gary Ablett Sr.', 'Gary Ablett Jr.', 'Joel Selwood', 'Jimmy Bartel', 'Patrick Dangerfield', 'Tom Hawkins'],
    traditionalRivalClubIds: ['collingwood', 'hawthorn', 'carlton'],
  },

  goldcoast: {
    premiershipYears: [],
    grandFinalLossYears: [],
    aflDebut: 2011,
    clubLore:
      'The Gold Coast Suns entered the competition in 2011 as part of the AFL\'s expansion into Queensland, joining the Brisbane Lions in giving the Sunshine State two teams. Playing out of Metricon Stadium in Carrara, the Suns have battled to establish a sustainable presence in a rugby league-dominated market. Led by emerging talents and promising young players, the club is building toward its first finals campaign.',
    legendaryPlayers: ['Gary Ablett Jr.', 'Touk Miller', 'David Swallow', 'Charlie Constable', 'Noah Anderson', 'Ben King'],
    traditionalRivalClubIds: ['brisbane'],
  },

  gws: {
    premiershipYears: [],
    grandFinalLossYears: [2019],
    aflDebut: 2012,
    formerNames: ['Greater Western Sydney Giants'],
    clubLore:
      'The GWS Giants were established in 2012 to grow football\'s footprint in western Sydney and beyond. Despite early struggles, the Giants rapidly developed into a genuine contender, reaching the 2019 Grand Final just seven years after their founding — one of the fastest rises in the competition\'s history. The club\'s academy-developed talent pipeline and modern facility in the Spotless Stadium precinct positions them as a perennial threat.',
    legendaryPlayers: ['Stephen Coniglio', 'Toby Greene', 'Jeremy Cameron', 'Lachie Whitfield', 'Josh Kelly', 'Tom Green'],
    traditionalRivalClubIds: ['sydney'],
  },

  hawthorn: {
    premiershipYears: [1961, 1963, 1971, 1976, 1978, 1983, 1986, 1988, 1989, 1991, 2008, 2013, 2014, 2015],
    grandFinalLossYears: [1984, 1985, 2012],
    aflDebut: 1897,
    clubLore:
      'Hawthorn\'s brown and gold is synonymous with sustained excellence across two distinct dynasty periods. The Hawks dominated the 1980s and early 1990s with a relentless winning culture under coach Allan Jeans and Leigh Matthews, then repeated the feat thirty years later with three consecutive flags from 2013 to 2015 under Alastair Clarkson. Only Brisbane\'s three-peat matches Hawthorn\'s back-to-back-to-back in the AFL era.',
    legendaryPlayers: ['Leigh Matthews', 'Michael Tuck', 'Jason Dunstall', 'Dermott Brereton', 'Luke Hodge', 'Lance Franklin', 'Jarryd Roughead'],
    traditionalRivalClubIds: ['geelong', 'carlton', 'richmond'],
  },

  melbourne: {
    premiershipYears: [1900, 1926, 1939, 1940, 1941, 1948, 1955, 1956, 1959, 1960, 1964, 2021],
    grandFinalLossYears: [2000],
    aflDebut: 1897,
    formerNames: ['Melbourne Football Club (oldest surviving club, est. 1858)'],
    clubLore:
      'Melbourne Football Club is the oldest surviving football club in the world, founded in 1858 and a powerhouse of the VFL throughout the 20th century. The Demons\' 2021 premiership — their first in 57 years — ended one of sport\'s longest flag droughts in what supporters regard as the club\'s greatest achievement of the modern era. The MCG, Melbourne\'s spiritual home, has been a cathedral for the red and blue since the game\'s earliest days.',
    legendaryPlayers: ['Norm Smith', 'Ron Barassi', 'Garry Lyon', 'David Neitz', 'Christian Petracca', 'Max Gawn', 'Clayton Oliver'],
    traditionalRivalClubIds: ['collingwood', 'hawthorn', 'richmond'],
  },

  northmelbourne: {
    premiershipYears: [1975, 1977, 1996, 1999],
    grandFinalLossYears: [1974, 1976, 1978, 1998],
    aflDebut: 1897,
    formerNames: ['North Melbourne (VFL debut 1925 as a VFL club)'],
    clubLore:
      'The Kangaroos have produced some of Australian football\'s most celebrated champions and moments across their history at Arden Street and beyond. Coached by Ron Barassi during their 1975 and 1977 flag years, and then Wayne Carey-era dominance leading to back-to-back flags in 1996–99, North has punched above their weight for generations. The club\'s recent move to Hobart reflects the ongoing evolution of a club with deep ties to their Victorian working-class roots.',
    legendaryPlayers: ['Wayne Carey', 'Keith Greig', 'Michael Tuck', 'David King', 'Brent Harvey', 'Drew Petrie'],
    traditionalRivalClubIds: ['carlton', 'hawthorn', 'westernbulldogs'],
  },

  portadelaide: {
    premiershipYears: [2004],
    grandFinalLossYears: [2007],
    aflDebut: 1997,
    formerNames: ['Port Adelaide Football Club (SANFL, est. 1870)'],
    clubLore:
      'Port Adelaide brings over 150 years of football history to the AFL, having dominated South Australian football before earning their AFL licence in 1997. Their 2004 premiership, achieved in just their eighth AFL season, validated the club\'s fierce competitor reputation and gave South Australia two flag-winning teams. The Power\'s Showdown rivalry with the Adelaide Crows is one of the most intense interstate derbies in Australian sport.',
    legendaryPlayers: ['Warren Tredrea', 'Kane Cornes', 'Domenic Cassisi', 'Travis Boak', 'Charlie Dixon', 'Robbie Gray'],
    traditionalRivalClubIds: ['adelaide'],
  },

  richmond: {
    premiershipYears: [1920, 1921, 1932, 1934, 1943, 1967, 1969, 1973, 1974, 1980, 2017, 2019, 2020],
    grandFinalLossYears: [1982],
    aflDebut: 1897,
    clubLore:
      'Richmond\'s yellow and black represents one of the AFL\'s most enduring supporter bases and a club that has experienced both glorious peaks and long valleys. The 2017 premiership, won in a dominant fashion with Dustin Martin delivering one of the greatest individual seasons in history, launched a remarkable three-flag dynasty through 2020. Punt Road Oval\'s roar on a finals night remains one of Australian sport\'s defining experiences.',
    legendaryPlayers: ['Jack Dyer', 'Matthew Richardson', 'Dustin Martin', 'Trent Cotchin', 'Jack Riewoldt', 'Tom Lynch'],
    traditionalRivalClubIds: ['carlton', 'collingwood'],
  },

  stkilda: {
    premiershipYears: [1966],
    grandFinalLossYears: [1997, 2009, 2010],
    aflDebut: 1897,
    clubLore:
      'St Kilda has endured the longest active premiership drought in Australian football — a fact their passionate supporter base wears as a badge of both suffering and loyalty. The Saints\' 1966 premiership remains their sole flag after one of the most dramatic Grand Finals in VFL history. Three Grand Final defeats across modern times, including the 2009 draw-and-replay loss to Geelong, have only deepened the folklore surrounding one of football\'s most bittersweet clubs.',
    legendaryPlayers: ['Trevor Barker', 'Robert Harvey', 'Nick Riewoldt', 'Nicky Winmar', 'Stewart Loewe', 'Sebastian Ross'],
    traditionalRivalClubIds: ['richmond', 'melbourne'],
  },

  sydney: {
    premiershipYears: [1909, 1918, 1933, 2005, 2012],
    grandFinalLossYears: [1996, 2006, 2014, 2016, 2022, 2024],
    aflDebut: 1897,
    formerNames: ['South Melbourne Football Club (until 1982)'],
    clubLore:
      'The Swans carry the history of South Melbourne into the modern game, having relocated to Sydney in 1982 in one of the boldest decisions in the competition\'s history. Building football in a rugby league state took decades, but the 2005 premiership — secured by one of the most dramatic last-quarter defensive stands in Grand Final history — transformed the club forever. The SCG remains one of the most iconic grounds in football, a symbol of the Swans\' transformation from survival story to perennial powerhouse.',
    legendaryPlayers: ['Paul Kelly', 'Adam Goodes', 'Michael O\'Loughlin', 'Lance Franklin', 'Josh Kennedy', 'John Longmire'],
    traditionalRivalClubIds: ['gws', 'adelaide', 'geelong'],
  },

  westcoast: {
    premiershipYears: [1992, 1994, 2006, 2018],
    grandFinalLossYears: [1991, 2005, 2015],
    aflDebut: 1987,
    clubLore:
      'West Coast entered the VFL/AFL in 1987 as Western Australia\'s first national team and quickly became a powerhouse, reaching three Grand Finals in their first decade and winning two of them. The Eagles\' 2006 premiership victory over Sydney — one of the tightest Grand Finals ever played — and their 2018 flag capped two distinct championship eras. The passion of Perth\'s football community, on full display on match days at Optus Stadium, reflects the Eagles\' central role in WA sporting culture.',
    legendaryPlayers: ['Glen Jakovich', 'Peter Matera', 'Ben Cousins', 'Dean Cox', 'Josh Kennedy', 'Nic Naitanui'],
    traditionalRivalClubIds: ['fremantle'],
  },

  westernbulldogs: {
    premiershipYears: [1954, 2016, 2021],
    grandFinalLossYears: [],
    aflDebut: 1897,
    formerNames: ['Footscray Football Club (until 1997)'],
    clubLore:
      'The Western Bulldogs carry the working-class spirit of Footscray into every game, a club that has always punched above its weight against the competition\'s powerhouses. The 2016 premiership, won from seventh place on the ladder in the most dramatic finals series imaginable, is considered the greatest underdog triumph in AFL history. Their 2021 flag followed just five years later, confirming that the Bulldogs\' culture of resilience and team-first football is no accident.',
    legendaryPlayers: ['Ted Whitten', 'Scott West', 'Bob Murphy', 'Marcus Bontempelli', 'Lachie Hunter', 'Bailey Smith'],
    traditionalRivalClubIds: ['carlton', 'northmelbourne'],
  },
}

// ---------------------------------------------------------------------------
// AFL Season Records (1990–2024)
// Winner's score listed as `home`, runner-up as `away`
// ---------------------------------------------------------------------------

export const AFL_SEASON_RECORDS: SeasonRecord[] = [
  { year: 1990, premierClubId: 'collingwood', runnerUpClubId: 'essendon',       grandFinalScore: { home: 96,  away: 77  }, ladderTopFour: ['collingwood', 'essendon', 'carlton', 'hawthorn'] },
  { year: 1991, premierClubId: 'hawthorn',    runnerUpClubId: 'westcoast',      grandFinalScore: { home: 80,  away: 74  }, ladderTopFour: ['hawthorn', 'westcoast', 'geelong', 'carlton'] },
  { year: 1992, premierClubId: 'westcoast',   runnerUpClubId: 'geelong',        grandFinalScore: { home: 130, away: 98  }, ladderTopFour: ['westcoast', 'geelong', 'carlton', 'collingwood'] },
  { year: 1993, premierClubId: 'essendon',    runnerUpClubId: 'carlton',        grandFinalScore: { home: 89,  away: 78  }, ladderTopFour: ['essendon', 'carlton', 'geelong', 'richmond'] },
  { year: 1994, premierClubId: 'westcoast',   runnerUpClubId: 'geelong',        grandFinalScore: { home: 82,  away: 80  }, ladderTopFour: ['westcoast', 'geelong', 'carlton', 'northmelbourne'] },
  { year: 1995, premierClubId: 'carlton',     runnerUpClubId: 'geelong',        grandFinalScore: { home: 132, away: 78  }, ladderTopFour: ['carlton', 'geelong', 'essendon', 'northmelbourne'] },
  { year: 1996, premierClubId: 'northmelbourne', runnerUpClubId: 'sydney',      grandFinalScore: { home: 115, away: 82  }, ladderTopFour: ['northmelbourne', 'sydney', 'carlton', 'essendon'] },
  { year: 1997, premierClubId: 'adelaide',    runnerUpClubId: 'stkilda',        grandFinalScore: { home: 112, away: 82  }, ladderTopFour: ['adelaide', 'stkilda', 'carlton', 'essendon'] },
  { year: 1998, premierClubId: 'adelaide',    runnerUpClubId: 'northmelbourne', grandFinalScore: { home: 149, away: 80  }, ladderTopFour: ['adelaide', 'northmelbourne', 'carlton', 'essendon'] },
  { year: 1999, premierClubId: 'northmelbourne', runnerUpClubId: 'carlton',     grandFinalScore: { home: 87,  away: 68  }, ladderTopFour: ['northmelbourne', 'carlton', 'essendon', 'hawthorn'] },
  { year: 2000, premierClubId: 'essendon',    runnerUpClubId: 'melbourne',      grandFinalScore: { home: 119, away: 78  }, ladderTopFour: ['essendon', 'melbourne', 'richmond', 'geelong'] },
  { year: 2001, premierClubId: 'brisbane',    runnerUpClubId: 'essendon',       grandFinalScore: { home: 104, away: 60  }, ladderTopFour: ['brisbane', 'essendon', 'collingwood', 'richmond'] },
  { year: 2002, premierClubId: 'brisbane',    runnerUpClubId: 'collingwood',    grandFinalScore: { home: 111, away: 99  }, ladderTopFour: ['brisbane', 'collingwood', 'essendon', 'melbourne'] },
  { year: 2003, premierClubId: 'brisbane',    runnerUpClubId: 'collingwood',    grandFinalScore: { home: 124, away: 82  }, ladderTopFour: ['brisbane', 'collingwood', 'sydney', 'essendon'] },
  { year: 2004, premierClubId: 'portadelaide', runnerUpClubId: 'brisbane',      grandFinalScore: { home: 130, away: 90  }, ladderTopFour: ['portadelaide', 'brisbane', 'hawthorn', 'geelong'] },
  { year: 2005, premierClubId: 'sydney',      runnerUpClubId: 'westcoast',      grandFinalScore: { home: 88,  away: 84  }, ladderTopFour: ['sydney', 'westcoast', 'geelong', 'adelaide'] },
  { year: 2006, premierClubId: 'westcoast',   runnerUpClubId: 'sydney',         grandFinalScore: { home: 99,  away: 91  }, ladderTopFour: ['westcoast', 'sydney', 'adelaide', 'collingwood'] },
  { year: 2007, premierClubId: 'geelong',     runnerUpClubId: 'portadelaide',   grandFinalScore: { home: 166, away: 76  }, ladderTopFour: ['geelong', 'portadelaide', 'collingwood', 'hawthorn'] },
  { year: 2008, premierClubId: 'hawthorn',    runnerUpClubId: 'geelong',        grandFinalScore: { home: 115, away: 90  }, ladderTopFour: ['hawthorn', 'geelong', 'collingwood', 'westernbulldogs'] },
  { year: 2009, premierClubId: 'geelong',     runnerUpClubId: 'stkilda',        grandFinalScore: { home: 80,  away: 68  }, ladderTopFour: ['geelong', 'stkilda', 'collingwood', 'westernbulldogs'] },
  { year: 2010, premierClubId: 'collingwood', runnerUpClubId: 'stkilda',        grandFinalScore: { home: 108, away: 80  }, ladderTopFour: ['collingwood', 'stkilda', 'geelong', 'westernbulldogs'] },
  { year: 2011, premierClubId: 'geelong',     runnerUpClubId: 'collingwood',    grandFinalScore: { home: 130, away: 60  }, ladderTopFour: ['geelong', 'collingwood', 'hawthorn', 'westernbulldogs'] },
  { year: 2012, premierClubId: 'sydney',      runnerUpClubId: 'hawthorn',       grandFinalScore: { home: 122, away: 101 }, ladderTopFour: ['sydney', 'hawthorn', 'collingwood', 'adelaide'] },
  { year: 2013, premierClubId: 'hawthorn',    runnerUpClubId: 'fremantle',      grandFinalScore: { home: 103, away: 84  }, ladderTopFour: ['hawthorn', 'fremantle', 'geelong', 'sydney'] },
  { year: 2014, premierClubId: 'hawthorn',    runnerUpClubId: 'sydney',         grandFinalScore: { home: 95,  away: 55  }, ladderTopFour: ['hawthorn', 'sydney', 'geelong', 'portadelaide'] },
  { year: 2015, premierClubId: 'hawthorn',    runnerUpClubId: 'westcoast',      grandFinalScore: { home: 132, away: 124 }, ladderTopFour: ['hawthorn', 'westcoast', 'fremantle', 'geelong'] },
  { year: 2016, premierClubId: 'westernbulldogs', runnerUpClubId: 'sydney',     grandFinalScore: { home: 89,  away: 67  }, ladderTopFour: ['hawthorn', 'geelong', 'sydney', 'westernbulldogs'] },
  { year: 2017, premierClubId: 'richmond',    runnerUpClubId: 'adelaide',       grandFinalScore: { home: 136, away: 50  }, ladderTopFour: ['richmond', 'adelaide', 'geelong', 'sydney'] },
  { year: 2018, premierClubId: 'westcoast',   runnerUpClubId: 'collingwood',    grandFinalScore: { home: 79,  away: 74  }, ladderTopFour: ['richmond', 'collingwood', 'westcoast', 'hawthorn'] },
  { year: 2019, premierClubId: 'richmond',    runnerUpClubId: 'gws',            grandFinalScore: { home: 114, away: 25  }, ladderTopFour: ['geelong', 'brisbane', 'richmond', 'gws'] },
  { year: 2020, premierClubId: 'richmond',    runnerUpClubId: 'geelong',        grandFinalScore: { home: 81,  away: 50  }, ladderTopFour: ['richmond', 'geelong', 'brisbane', 'portadelaide'] },
  { year: 2021, premierClubId: 'melbourne',   runnerUpClubId: 'westernbulldogs',grandFinalScore: { home: 140, away: 66  }, ladderTopFour: ['melbourne', 'westernbulldogs', 'geelong', 'brisbane'] },
  { year: 2022, premierClubId: 'geelong',     runnerUpClubId: 'sydney',         grandFinalScore: { home: 133, away: 52  }, ladderTopFour: ['geelong', 'sydney', 'brisbane', 'collingwood'] },
  { year: 2023, premierClubId: 'collingwood', runnerUpClubId: 'brisbane',       grandFinalScore: { home: 96,  away: 92  }, ladderTopFour: ['collingwood', 'brisbane', 'melbourne', 'carlton'] },
  { year: 2024, premierClubId: 'brisbane',    runnerUpClubId: 'sydney',         grandFinalScore: { home: 112, away: 76  }, ladderTopFour: ['brisbane', 'sydney', 'geelong', 'carlton'] },
]

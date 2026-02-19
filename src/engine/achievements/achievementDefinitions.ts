import type { AchievementDef } from '@/types/achievements'

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // Premiership (3)
  {
    id: 'premiership-bronze',
    category: 'premiership',
    tier: 'bronze',
    title: 'Grand Finalist',
    description: 'Reach a Grand Final as senior coach.',
  },
  {
    id: 'premiership-silver',
    category: 'premiership',
    tier: 'silver',
    title: 'Premier',
    description: 'Win 1 Premiership.',
  },
  {
    id: 'premiership-gold',
    category: 'premiership',
    tier: 'gold',
    title: 'Dynasty Builder',
    description: 'Win 3 Premierships across your career.',
  },

  // Dynasty (3)
  {
    id: 'dynasty-bronze',
    category: 'dynasty',
    tier: 'bronze',
    title: 'Back-to-Back',
    description: 'Win back-to-back Premiership flags.',
  },
  {
    id: 'dynasty-silver',
    category: 'dynasty',
    tier: 'silver',
    title: 'Three-Peat',
    description: 'Win 3 consecutive Premiership flags.',
  },
  {
    id: 'dynasty-gold',
    category: 'dynasty',
    tier: 'gold',
    title: 'Immortal Dynasty',
    description: 'Win 5 Premiership flags in total.',
  },

  // Club Rebuild (3)
  {
    id: 'club-rebuild-bronze',
    category: 'club-rebuild',
    tier: 'bronze',
    title: 'Turnaround Artist',
    description: 'Take a bottom-6 club to the top 8 in a single season.',
  },
  {
    id: 'club-rebuild-silver',
    category: 'club-rebuild',
    tier: 'silver',
    title: 'The Fixer',
    description: 'Win a Premiership within 5 seasons of taking over a bottom-6 club.',
  },
  {
    id: 'club-rebuild-gold',
    category: 'club-rebuild',
    tier: 'gold',
    title: 'Master Tactician',
    description: 'Win a Premiership with 3 different clubs.',
  },

  // Player Development (3)
  {
    id: 'player-development-bronze',
    category: 'player-development',
    tier: 'bronze',
    title: 'Developer',
    description: 'Improve a player by 15+ overall rating in a single offseason.',
  },
  {
    id: 'player-development-silver',
    category: 'player-development',
    tier: 'silver',
    title: 'Diamond in the Rough',
    description: 'Recruit or draft a player rated below 65 OVR who reaches 85+ OVR.',
  },
  {
    id: 'player-development-gold',
    category: 'player-development',
    tier: 'gold',
    title: 'Production Line',
    description: 'Have 5 or more All-Australian selections from your squad in a single season.',
  },

  // Draft & Scouting (3)
  {
    id: 'draft-scouting-bronze',
    category: 'draft-scouting',
    tier: 'bronze',
    title: 'Talent Spotter',
    description: 'A top-10 pick you drafted reaches 82+ overall rating.',
  },
  {
    id: 'draft-scouting-silver',
    category: 'draft-scouting',
    tier: 'silver',
    title: 'Brownlow Draftee',
    description: 'A first-round pick you drafted wins the Brownlow Medal.',
  },
  {
    id: 'draft-scouting-gold',
    category: 'draft-scouting',
    tier: 'gold',
    title: 'Class of Champions',
    description: '3 players from the same draft class all reach 80+ overall rating.',
  },

  // Awards (3)
  {
    id: 'awards-bronze',
    category: 'awards',
    tier: 'bronze',
    title: 'Award Winner',
    description: 'A player wins any major individual award while at your club.',
  },
  {
    id: 'awards-silver',
    category: 'awards',
    tier: 'silver',
    title: 'Brownlow Club',
    description: 'A player wins the Brownlow Medal while at your club.',
  },
  {
    id: 'awards-gold',
    category: 'awards',
    tier: 'gold',
    title: 'Double Medallion',
    description: 'A player wins both the Brownlow Medal and Coleman Medal in the same season.',
  },

  // Season Performance (3)
  {
    id: 'season-performance-bronze',
    category: 'season-performance',
    tier: 'bronze',
    title: 'Juggernaut',
    description: 'Win 15 or more regular season games in a single season.',
  },
  {
    id: 'season-performance-silver',
    category: 'season-performance',
    tier: 'silver',
    title: 'Minor Premiers',
    description: 'Finish 1st on the ladder at the end of the regular season.',
  },
  {
    id: 'season-performance-gold',
    category: 'season-performance',
    tier: 'gold',
    title: 'Unbeaten Finals',
    description: 'Win a Premiership without losing a single final.',
  },

  // Youth (3)
  {
    id: 'youth-bronze',
    category: 'youth',
    tier: 'bronze',
    title: 'Rising Star Club',
    description: 'A player wins the Rising Star award while at your club.',
  },
  {
    id: 'youth-silver',
    category: 'youth',
    tier: 'silver',
    title: 'Production Line',
    description: 'Graduate 5 rookies to the senior list under your tenure.',
  },
  {
    id: 'youth-gold',
    category: 'youth',
    tier: 'gold',
    title: 'Young Guns',
    description: 'Win a Premiership with a squad averaging under 24 years of age.',
  },

  // Club Building (3)
  {
    id: 'club-building-bronze',
    category: 'club-building',
    tier: 'bronze',
    title: 'First-Class Facility',
    description: 'Upgrade any facility to the maximum level (5/5).',
  },
  {
    id: 'club-building-silver',
    category: 'club-building',
    tier: 'silver',
    title: 'World-Class Club',
    description: 'Have all 6 facilities at level 4 or above.',
  },
  {
    id: 'club-building-gold',
    category: 'club-building',
    tier: 'gold',
    title: 'Complete Package',
    description: 'Win a Premiership with all 6 facilities at the maximum level (5/5).',
  },

  // Management (3)
  {
    id: 'management-bronze',
    category: 'management',
    tier: 'bronze',
    title: 'Loyal Servant',
    description: 'Coach the same club for 5 or more consecutive seasons.',
  },
  {
    id: 'management-silver',
    category: 'management',
    tier: 'silver',
    title: 'Veteran Coach',
    description: 'Coach for 10 or more total seasons across your career.',
  },
  {
    id: 'management-gold',
    category: 'management',
    tier: 'gold',
    title: 'Dual Premiership Coach',
    description: 'Win Premierships with 2 different clubs.',
  },

  // Records (3)
  {
    id: 'records-bronze',
    category: 'records',
    tier: 'bronze',
    title: 'Stat Leader',
    description: 'A player at your club leads the league in any major statistical category for a season.',
  },
  {
    id: 'records-silver',
    category: 'records',
    tier: 'silver',
    title: 'Coleman Medallist',
    description: 'A player wins the Coleman Medal (league leading goalkicker) while at your club.',
  },
  {
    id: 'records-gold',
    category: 'records',
    tier: 'gold',
    title: 'Record Breaker',
    description: 'A player at your club breaks 3 or more all-time league records across their career.',
  },

  // Hall of Fame (3)
  {
    id: 'hall-of-fame-bronze',
    category: 'hall-of-fame',
    tier: 'bronze',
    title: 'Club Legend',
    description: 'A player retires with Legend legacy tier after spending their final years at your club.',
  },
  {
    id: 'hall-of-fame-silver',
    category: 'hall-of-fame',
    tier: 'silver',
    title: 'Legends Factory',
    description: 'Three Legend-tier players retire from your club across your tenure.',
  },
  {
    id: 'hall-of-fame-gold',
    category: 'hall-of-fame',
    tier: 'gold',
    title: 'Hall of Fame Club',
    description: 'Five or more Legend or Club-Great tier players retire from your club.',
  },
]

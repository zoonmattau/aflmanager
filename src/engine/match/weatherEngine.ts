/**
 * weatherEngine.ts
 *
 * Dynamic wind / weather generation for matches.
 * Wind direction alternates advantage each quarter (teams switch ends).
 */

import type { SeededRNG } from '@/engine/core/rng'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WindDirection = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW'
export type WindStrength = 'calm' | 'light' | 'moderate' | 'strong' | 'gale'
export type WeatherConditionExt = 'clear' | 'windy' | 'wet' | 'hot' | 'humid'

export interface QuarterWeatherEntry {
  quarter: number
  condition: WeatherConditionExt
  windStrength: WindStrength
  changeNote?: string
}

export interface MatchWeatherData {
  windDirection: WindDirection
  windStrength: WindStrength
  /** Which team has wind in their backs when kicking in Q1. */
  windAdvantageEnd: 'home' | 'away'
  quarterWeather: QuarterWeatherEntry[]
  coinTossWinner: 'home' | 'away'
}

// ---------------------------------------------------------------------------
// Wind accuracy modifier
// ---------------------------------------------------------------------------

const WIND_BASE_MOD = 0.12

const STRENGTH_SCALE: Record<WindStrength, number> = {
  calm:     0,
  light:    0.5,
  moderate: 1.0,
  strong:   1.5,
  gale:     2.0,
}

/**
 * Return the accuracy modifier for a team kicking in a given quarter.
 * Teams switch ends each quarter so wind advantage alternates.
 * Returns positive = with wind, negative = into wind, 0 = calm.
 */
export function getWindAccuracyMod(
  teamSide: 'home' | 'away',
  quarter: number,
  windAdvantageEnd: 'home' | 'away',
  windStrength: WindStrength,
): number {
  const scale = STRENGTH_SCALE[windStrength]
  if (scale === 0) return 0

  // Q1, Q3: windAdvantageEnd kicks WITH the wind
  // Q2, Q4: opposite team kicks WITH the wind
  const hasAdvantage = (quarter % 2 === 1)
    ? teamSide === windAdvantageEnd
    : teamSide !== windAdvantageEnd

  return hasAdvantage ? WIND_BASE_MOD * scale : -WIND_BASE_MOD * scale
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateMatchWeather(rng: SeededRNG, venueId?: string): MatchWeatherData {
  // Wind direction
  const directions: WindDirection[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']
  const windDirection = directions[Math.floor(rng.next() * directions.length)]

  // Wind strength (weighted — calm/light most common)
  const strengthRoll = rng.next()
  let windStrength: WindStrength
  if      (strengthRoll < 0.18) windStrength = 'calm'
  else if (strengthRoll < 0.42) windStrength = 'light'
  else if (strengthRoll < 0.68) windStrength = 'moderate'
  else if (strengthRoll < 0.88) windStrength = 'strong'
  else                          windStrength = 'gale'

  // Marvel Stadium and other covered venues have minimal wind
  if (venueId === 'marvel-stadium' || venueId === 'brisbane-gabba') {
    windStrength = 'calm'
  }

  // Coin toss
  const coinTossWinner: 'home' | 'away' = rng.next() < 0.5 ? 'home' : 'away'
  // Coin toss winner kicks WITH the wind in Q1
  const windAdvantageEnd: 'home' | 'away' = coinTossWinner

  // Base condition (mirror the weights used in simulateMatch)
  const conditions: WeatherConditionExt[] = ['clear', 'windy', 'wet', 'hot', 'humid']
  const condWeights = [0.54, 0.17, 0.15, 0.08, 0.06]
  const condRoll = rng.next()
  let cumulative = 0
  let baseCondition: WeatherConditionExt = 'clear'
  for (let i = 0; i < conditions.length; i++) {
    cumulative += condWeights[i]
    if (condRoll <= cumulative) {
      baseCondition = conditions[i]
      break
    }
  }

  // Quarter-by-quarter weather (4 quarters)
  const quarterWeather: QuarterWeatherEntry[] = []
  let currentCondition: WeatherConditionExt = baseCondition
  let currentWindStrength: WindStrength = windStrength

  for (let q = 1; q <= 4; q++) {
    let changeNote: string | undefined

    if (q > 1 && rng.next() < 0.20) {
      // 20% chance of notable weather change between quarters
      const newCondRoll = rng.next()
      let newCond: WeatherConditionExt
      if      (newCondRoll < 0.45) newCond = 'clear'
      else if (newCondRoll < 0.62) newCond = 'wet'
      else if (newCondRoll < 0.77) newCond = 'windy'
      else if (newCondRoll < 0.90) newCond = 'humid'
      else                         newCond = 'hot'

      if (newCond !== currentCondition) {
        const label =
          newCond === 'wet'   ? 'Rain arrives' :
          newCond === 'windy' ? 'Wind picks up' :
          newCond === 'clear' ? 'Conditions clear' :
          newCond === 'hot'   ? 'Heat building' :
          'Conditions shift'
        changeNote = `${label} in Q${q}`
        currentCondition = newCond
      }

      // Wind strength may also shift slightly
      if (rng.next() < 0.30 && windStrength !== 'calm') {
        const strengths: WindStrength[] = ['calm', 'light', 'moderate', 'strong', 'gale']
        const idx = strengths.indexOf(currentWindStrength)
        const delta = rng.next() < 0.5 ? 1 : -1
        currentWindStrength = strengths[Math.max(0, Math.min(4, idx + delta))]
      }
    }

    quarterWeather.push({
      quarter: q,
      condition: currentCondition,
      windStrength: currentWindStrength,
      changeNote,
    })
  }

  return {
    windDirection,
    windStrength,
    windAdvantageEnd,
    quarterWeather,
    coinTossWinner,
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function windDirectionArrow(dir: WindDirection): string {
  const arrows: Record<WindDirection, string> = {
    N: '↑', S: '↓', E: '→', W: '←',
    NE: '↗', NW: '↖', SE: '↘', SW: '↙',
  }
  return arrows[dir]
}

export function windStrengthLabel(strength: WindStrength): string {
  return strength.charAt(0).toUpperCase() + strength.slice(1)
}

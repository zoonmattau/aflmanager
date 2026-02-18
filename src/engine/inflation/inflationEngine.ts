// ---------------------------------------------------------------------------
// Inflation Engine
//
// All AFL financial constants are expressed in "base year" real dollars.
// The inflationIndex compounds annually. Year 1 = 1.0.
//
// Usage:
//   toNominal(baseValue, inflationIndex)  →  what that value costs this season
//   toReal(nominalValue, inflationIndex)  →  what that value is worth in base-year dollars
// ---------------------------------------------------------------------------

export type InflationPreset = 'stable' | 'moderate' | 'high' | 'volatile' | 'custom'

export interface InflationSettings {
  enabled: boolean
  preset: InflationPreset
  /** Annual CPI rate as a decimal (e.g. 0.025 = 2.5%). Used when preset = 'custom' or for display. */
  baseRate: number
  /** When true, add ±1% random variation each year around baseRate. */
  randomness: boolean
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const INFLATION_PRESETS: Record<InflationPreset, { label: string; baseRate: number; description: string }> = {
  stable:   { label: 'Stable',   baseRate: 0.010, description: '1.0% p.a. — steady, low inflation era' },
  moderate: { label: 'Moderate', baseRate: 0.025, description: '2.5% p.a. — realistic AFL cap growth' },
  high:     { label: 'High',     baseRate: 0.040, description: '4.0% p.a. — wage explosion era' },
  volatile: { label: 'Volatile', baseRate: 0.025, description: '2.5% p.a. ±1% random each year' },
  custom:   { label: 'Custom',   baseRate: 0.025, description: 'User-defined CPI rate' },
}

export const DEFAULT_INFLATION_SETTINGS: InflationSettings = {
  enabled: true,
  preset: 'moderate',
  baseRate: 0.025,
  randomness: false,
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Advance the inflation index by one year.
 * Returns the new index and the actual rate applied.
 */
export function advanceInflationIndex(
  currentIndex: number,
  settings: InflationSettings,
  randomSeed: number,
): { newIndex: number; actualRate: number } {
  if (!settings.enabled) return { newIndex: currentIndex, actualRate: 0 }

  const baseRate = resolvePresetRate(settings)

  let actualRate = baseRate
  if (settings.randomness || settings.preset === 'volatile') {
    // Simple deterministic variance from seed (avoids importing SeededRNG here)
    const pseudoRandom = ((Math.sin(randomSeed * 9301 + 49297) * 233280) % 1 + 1) % 1
    // ±1% band around baseRate
    actualRate = baseRate + (pseudoRandom - 0.5) * 0.02
  }

  // Clamp rate to -2%..+10% to prevent degenerate cases
  actualRate = Math.max(-0.02, Math.min(0.10, actualRate))
  const newIndex = Math.round(currentIndex * (1 + actualRate) * 100000) / 100000

  return { newIndex, actualRate }
}

/** Resolve the base rate for a preset (falls through to custom if preset = 'custom'). */
export function resolvePresetRate(settings: InflationSettings): number {
  if (settings.preset === 'custom') return settings.baseRate
  return INFLATION_PRESETS[settings.preset].baseRate
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Convert a base-year real value to this season's nominal value. */
export function toNominal(realValue: number, inflationIndex: number): number {
  return Math.round(realValue * inflationIndex)
}

/** Convert a nominal value (this season) back to base-year real dollars. */
export function toReal(nominalValue: number, inflationIndex: number): number {
  if (inflationIndex <= 0) return nominalValue
  return Math.round(nominalValue / inflationIndex)
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format inflation rate as percentage string, e.g. "+2.5%" or "-0.3%". */
export function formatInflationRate(rate: number): string {
  const pct = (rate * 100).toFixed(1)
  return rate >= 0 ? `+${pct}%` : `${pct}%`
}

/** Describe the cumulative inflation relative to base year. */
export function formatInflationIndex(index: number): string {
  const pct = ((index - 1) * 100).toFixed(1)
  if (index >= 1) return `+${pct}% vs base year`
  return `${pct}% vs base year`
}

export interface InflationYearRecord {
  year: number
  index: number
  rate: number
}

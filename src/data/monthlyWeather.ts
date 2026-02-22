// ---------------------------------------------------------------------------
// Month-by-month weather bias table
//
// Each entry is an additive adjustment to the base weather probability weights:
//   base: { clear:0.54, windy:0.17, wet:0.15, hot:0.08, humid:0.06 }
//
// Positive values increase that condition's likelihood; negative values
// decrease it. The 'clear' weight automatically absorbs the net delta so totals
// remain normalised.
//
// Index 0 = January … Index 11 = December
// ---------------------------------------------------------------------------

export interface MonthlyBias {
  wind: number
  wet:  number
  hot:  number
  humid: number
}

// Helper so each row is easy to read
const mb = (wind: number, wet: number, hot: number, humid: number): MonthlyBias =>
  ({ wind, wet, hot, humid })

/**
 * Seasonal weather biases per Australian state/territory.
 * Applied on top of any venue-specific weatherBias.
 */
export const MONTHLY_WEATHER_BIASES: Record<string, MonthlyBias[]> = {
  // ── Victoria (Melbourne) ──────────────────────────────────────────────────
  // 4-season city: scorching summers, cold wet winters, famously unpredictable
  VIC: [
    mb(0.01, 0.02, 0.22, 0.02),  // Jan — hot and dry, heatwaves common
    mb(0.01, 0.04, 0.18, 0.03),  // Feb — still hot, occasional thunderstorms
    mb(0.02, 0.04, 0.08, 0.02),  // Mar — warm/cooling, autumn begins
    mb(0.04, 0.07, 0.00, 0.01),  // Apr — cool, increasing rain
    mb(0.06, 0.11, -0.03, 0.00), // May — cool and wetter
    mb(0.08, 0.14, -0.04, 0.00), // Jun — cold/wet, regular frosts
    mb(0.10, 0.16, -0.05, 0.00), // Jul — coldest, wettest month of the year
    mb(0.12, 0.13, -0.04, 0.00), // Aug — late winter, strong westerlies
    mb(0.08, 0.07,  0.01, 0.00), // Sep — spring, highly variable
    mb(0.04, 0.04,  0.05, 0.01), // Oct — warming, showers ease
    mb(0.02, 0.03,  0.10, 0.02), // Nov — warm, occasional storms
    mb(0.01, 0.03,  0.18, 0.03), // Dec — hot, elevated bushfire risk
  ],

  // ── South Australia (Adelaide) ────────────────────────────────────────────
  // Mediterranean: hot dry summers, mild wet winters, Adelaide Oval notorious wind
  SA: [
    mb(0.02, -0.04, 0.28, -0.02), // Jan — extremely hot and dry
    mb(0.03, -0.03, 0.22, -0.01), // Feb — very hot, dry easterlies
    mb(0.04, -0.01, 0.14, 0.00),  // Mar — warm, autumn cooling starts
    mb(0.04,  0.03, 0.04, 0.01),  // Apr — mild and pleasant
    mb(0.06,  0.08, -0.02, 0.01), // May — cool, rain arrives
    mb(0.08,  0.12, -0.04, 0.01), // Jun — cold and wet
    mb(0.10,  0.14, -0.05, 0.00), // Jul — coldest and wettest
    mb(0.11,  0.11, -0.04, 0.00), // Aug — windy, late-winter rains
    mb(0.10,  0.07,  0.02, 0.00), // Sep — spring winds, warming
    mb(0.06,  0.03,  0.08, 0.00), // Oct — warm, windy still
    mb(0.04,  0.00,  0.14, 0.00), // Nov — hot arriving, northerlies
    mb(0.02, -0.02, 0.24, -0.01), // Dec — hot, hot, hot
  ],

  // ── Western Australia (Perth) ─────────────────────────────────────────────
  // Mediterranean: relentless summer heat, wet windy winters, Fremantle Doctor sea breeze
  WA: [
    mb(0.04, -0.05, 0.32, -0.02), // Jan — very hot, dry; Fremantle Doctor daily
    mb(0.05, -0.04, 0.26, -0.01), // Feb — still very hot
    mb(0.05, -0.01, 0.18,  0.00), // Mar — warm, autumn transition
    mb(0.06,  0.04, 0.06,  0.00), // Apr — mild, first rains
    mb(0.07,  0.10, -0.02, 0.01), // May — cool, wet season starting
    mb(0.10,  0.16, -0.04, 0.01), // Jun — wet and windy
    mb(0.12,  0.20, -0.05, 0.00), // Jul — wettest month, strong winds
    mb(0.10,  0.15, -0.04, 0.00), // Aug — drying, still windy
    mb(0.10,  0.07,  0.02, 0.00), // Sep — spring breeze, warming
    mb(0.08,  0.02,  0.09, 0.00), // Oct — warming, Doctor breeze
    mb(0.07, -0.01, 0.18,  0.00), // Nov — hot, sea breeze strong
    mb(0.04, -0.04, 0.28, -0.01), // Dec — very hot
  ],

  // ── Queensland (Brisbane / Gold Coast) ───────────────────────────────────
  // Subtropical: hot wet summers, warm dry winters — opposite rhythm to the south
  QLD: [
    mb(-0.02, 0.14, 0.10, 0.20), // Jan — wet season, storms daily
    mb(-0.02, 0.12, 0.10, 0.18), // Feb — wet season continues
    mb( 0.00, 0.08, 0.08, 0.12), // Mar — late wet, still humid
    mb( 0.01, 0.03, 0.06, 0.06), // Apr — tropical autumn, drying
    mb( 0.00, -0.04, 0.04, 0.02), // May — dry season starts, pleasant
    mb( 0.00, -0.07, 0.01, -0.01), // Jun — dry and mild (best AFL weather)
    mb(-0.01, -0.08, 0.00, -0.02), // Jul — dry season peak, mild evenings
    mb( 0.00, -0.06, 0.02, -0.01), // Aug — dry, warming slightly
    mb( 0.00, -0.02, 0.06,  0.02), // Sep — build-up starts, warming
    mb( 0.00,  0.02, 0.10,  0.06), // Oct — hot and sticky again
    mb(-0.01, 0.04, 0.12,  0.10), // Nov — pre-wet season storms
    mb(-0.02, 0.10, 0.12,  0.16), // Dec — wet season onset
  ],

  // ── New South Wales (Sydney) ──────────────────────────────────────────────
  // Temperate/subtropical: hot humid summers, mild winters, year-round rain
  NSW: [
    mb(0.01, 0.04, 0.16, 0.12), // Jan — hot and humid, thunderstorms
    mb(0.01, 0.05, 0.14, 0.10), // Feb — hottest and most humid
    mb(0.01, 0.07, 0.08, 0.08), // Mar — warm/wet, autumn begins
    mb(0.02, 0.06, 0.02, 0.04), // Apr — mild, autumn rains
    mb(0.03, 0.07, -0.01, 0.02), // May — cool and wet
    mb(0.04, 0.10, -0.02, 0.01), // Jun — cool/wet (coldest month)
    mb(0.05, 0.12, -0.03, 0.00), // Jul — cold, wettest month
    mb(0.04, 0.08, -0.01, 0.01), // Aug — mild, some rain
    mb(0.03, 0.04,  0.03, 0.02), // Sep — spring, variable
    mb(0.02, 0.03,  0.08, 0.04), // Oct — warming, occasional storms
    mb(0.01, 0.03,  0.13, 0.07), // Nov — warm and humid
    mb(0.01, 0.05,  0.16, 0.10), // Dec — hot and humid
  ],

  // ── Tasmania (Hobart / Launceston) ───────────────────────────────────────
  // Cool temperate: the wettest and windiest AFL grounds; cool even in summer
  TAS: [
    mb(0.02, 0.02, 0.06, 0.01), // Jan — mild summer, clearest month
    mb(0.02, 0.03, 0.04, 0.01), // Feb — warm but not hot
    mb(0.04, 0.07, 0.00, 0.01), // Mar — autumn cooling, rain increasing
    mb(0.07, 0.13, -0.02, 0.00), // Apr — cool, wet, windy
    mb(0.10, 0.17, -0.04, 0.00), // May — cold and wet
    mb(0.14, 0.21, -0.05, 0.00), // Jun — very cold, wet and windy
    mb(0.16, 0.25, -0.05, 0.00), // Jul — worst month: cold, wet, gales
    mb(0.16, 0.22, -0.04, 0.00), // Aug — still very cold and windy
    mb(0.12, 0.14, -0.02, 0.00), // Sep — cold improving, winds ease
    mb(0.08, 0.08,  0.01, 0.00), // Oct — spring, brightening
    mb(0.04, 0.04,  0.03, 0.01), // Nov — mild spring
    mb(0.02, 0.02,  0.05, 0.01), // Dec — pleasant summer
  ],

  // ── Northern Territory (Darwin) ───────────────────────────────────────────
  // Tropical: monsoonal wet season (Nov–Apr), extremely hot dry season (May–Oct)
  NT: [
    mb(0.00, 0.26, 0.05, 0.26), // Jan — wet season peak, monsoon daily
    mb(0.00, 0.23, 0.05, 0.24), // Feb — wet season, cyclone risk
    mb(0.00, 0.18, 0.05, 0.20), // Mar — late wet, easing
    mb(0.00, 0.06, 0.06, 0.12), // Apr — transition, humidity dropping
    mb(0.01, -0.05, 0.10, 0.02), // May — dry season, very warm
    mb(0.01, -0.08, 0.08, -0.01), // Jun — dry season, perfect (rare cool)
    mb(0.01, -0.08, 0.07, -0.02), // Jul — driest month, warm but comfortable
    mb(0.01, -0.06, 0.09, -0.01), // Aug — dry, warming
    mb(0.01,  0.01, 0.14,  0.05), // Sep — build-up starts, sticky
    mb(0.01,  0.05, 0.18,  0.12), // Oct — build-up, oppressive humidity
    mb(0.00,  0.10, 0.18,  0.18), // Nov — pre-monsoon storms
    mb(0.00,  0.16, 0.08,  0.22), // Dec — wet season onset
  ],

  // ── Australian Capital Territory (Canberra) ───────────────────────────────
  // Continental: coldest winters on the mainland, hot dry summers, year-round frost risk
  ACT: [
    mb(0.01, -0.02, 0.24, -0.02), // Jan — hot and dry, bushfire risk
    mb(0.01,  0.01, 0.18, -0.01), // Feb — hot, late-summer storms
    mb(0.02,  0.04, 0.08,  0.01), // Mar — warm, autumn rain
    mb(0.04,  0.07, 0.01,  0.01), // Apr — cool, more rain
    mb(0.06,  0.10, -0.03, 0.00), // May — cold and wet
    mb(0.08,  0.13, -0.05, 0.00), // Jun — cold (frosts), wet
    mb(0.10,  0.16, -0.05, 0.00), // Jul — coldest, occasional snow near city
    mb(0.10,  0.13, -0.04, 0.00), // Aug — cold and windy
    mb(0.08,  0.07,  0.02, 0.00), // Sep — spring, windy and variable
    mb(0.05,  0.04,  0.07, 0.01), // Oct — warming, spring showers
    mb(0.02,  0.02,  0.13, 0.01), // Nov — warm and dry
    mb(0.01, -0.01, 0.22, -0.01), // Dec — hot, thunderstorms
  ],
}

/**
 * Returns the monthly weather bias for a given venue state and calendar month.
 * @param state  Two-letter Australian state/territory code (e.g. 'VIC', 'QLD')
 * @param month  Calendar month 1–12 (January = 1)
 */
export function getMonthlyWeatherBias(state: string, month: number): MonthlyBias {
  const table = MONTHLY_WEATHER_BIASES[state]
  if (!table) return { wind: 0, wet: 0, hot: 0, humid: 0 }
  const idx = Math.max(0, Math.min(11, month - 1))
  return table[idx]
}

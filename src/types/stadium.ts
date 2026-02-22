export type StadiumSurface = 'grass' | 'synthetic' | 'hybrid'

export interface CustomStadium {
  id: string
  name: string
  city: string
  state: string
  capacity: number
  surface: StadiumSurface
  opened: number
  notes?: string
  /** Multiplier on goal accuracy (0.7–1.3). >1.0 = more scoring shots converted. Default 1.0 */
  scoringCoefficient: number
  /** >1.0 = kick-dominant, <1.0 = handball-heavy. Default 1.0 */
  kickToHandballRatio: number
  /** Multiplier on total possessions per quarter. Big grounds = more disposals. Default 1.0 */
  disposalCoefficient: number
  /** Multiplier on marking chance. Open grounds = more marks. Default 1.0 */
  markCoefficient: number
  /** Multiplier on contested possession / tackle rate. Compact grounds = more congestion. Default 1.0 */
  contestedCoefficient: number
  /** Playing surface dimensions in metres */
  length: number
  width: number
  /** Weather tendency biases (additive, ~0.0–0.20 range). Default 0 = use regional baseline. */
  windBias: number
  wetBias: number
  hotBias: number
  humidBias: number
}

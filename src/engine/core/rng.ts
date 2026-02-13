/**
 * Seeded PRNG using mulberry32 algorithm.
 * Every random decision in the game goes through this for reproducibility.
 */
export class SeededRNG {
  private state: number

  constructor(seed: number) {
    this.state = seed
  }

  /** Returns a float between 0 (inclusive) and 1 (exclusive) */
  next(): number {
    this.state |= 0
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Returns an integer between min (inclusive) and max (inclusive) */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  /** Returns a float between min (inclusive) and max (exclusive) */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min
  }

  /** Returns true with the given probability (0-1) */
  chance(probability: number): boolean {
    return this.next() < probability
  }

  /** Picks a random element from an array */
  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)]
  }

  /** Shuffles an array in place (Fisher-Yates) */
  shuffle<T>(array: T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  /** Get the current seed state (for serialization) */
  getSeed(): number {
    return this.state
  }
}

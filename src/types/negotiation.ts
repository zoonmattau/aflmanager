export type NegotiationSignalLevel = 1 | 2 | 3
//  1 = coloured dots only (0–2 completed trades)
//  2 = named bars with ±1 noise (3–9 trades)
//  3 = intel report text + accurate bars (10+ trades)

export type ClubPublicStance = 'not-selling' | 'listening' | 'open' | 'eager' | 'desperate'

export interface ClubLeverageState {
  clubId: string
  computedAt: string             // ISO date
  urgencyScore: number           // 0–100 internal
  listNeedScore: number          // 0–100 (positions below 3 / total positions)
  capPressureScore: number       // 0–100 (spend vs cap, clamped)
  alternativeCount: number       // other clubs enquiring about target players
  publicStance: ClubPublicStance
}

export type NegotiationRoundStatus =
  | 'pending-ai'   // waiting for AI to respond (with delay)
  | 'stalling'     // AI is deliberately holding out
  | 'countered'    // AI sent back counter terms
  | 'pending-user' // counter received, awaiting user reply
  | 'accepted'
  | 'rejected'
  | 'expired'

export type AiResponseSignal = 'warming' | 'neutral' | 'cooling' | 'hardball' | 'bluffing' | 'desperate'

export interface NegotiationRound {
  roundNumber: number            // 1-indexed
  offeredAt: string              // ISO date user/AI made this offer
  respondBy: string              // ISO date AI is due to respond
  respondedAt: string | null
  offererId: string              // clubId that made THIS round's offer
  status: NegotiationRoundStatus
  offer: import('./trade').TradeNegotiationOffer
  // AI feedback after resolution
  aiSignal?: AiResponseSignal
  aiMessage?: string             // e.g. "We're fielding interest from two other clubs."
}

export interface NegotiationThread {
  id: string
  playerClubId: string
  partnerClubId: string
  status: 'active' | 'completed' | 'collapsed'
  initiatedAt: string
  rounds: NegotiationRound[]
  maxRounds: number              // default 3; increases +1 near deadline
  leverageSnapshot: ClubLeverageState  // captured when thread opens
  currentYear: number
}

export interface PlayerTradeRequest {
  active: boolean
  requestedAt: string
  nominatedClubIds: string[]
  reason: 'unhappy' | 'role' | 'contender' | 'home-state'
}

export interface TradePlayerMove {
  playerId: string
  fromClubId: string
  toClubId: string
}

export interface TradePickMove {
  pick: import('./club').DraftPick
  fromClubId: string
  toClubId: string
}

export interface TradeSalaryRetention {
  playerId: string
  retainingClubId: string
  receivingClubId: string
  amount: number
}

export interface TradeOfferMeta {
  deadlinePressure: number
  marketDemandScore: number
  isSalaryDump: boolean
  isPlayerInitiated: boolean
  requestedByPlayerId?: string
  nominatedClubIds?: string[]
}

export interface TradeEnquiry {
  id: string
  playerId: string
  fromClubId: string
  toClubId: string
  date: string
  interest: 'low' | 'medium' | 'high'
  note: string
}

export interface TradeBlockListing {
  playerId: string
  clubId: string
  listedAt: string
  active: boolean
  availability: 'available' | 'reluctant' | 'salary-dump'
  demandScore: number
  enquiryCount: number
  lastDemandUpdate: string
}

export interface TradeBlockState {
  listings: Record<string, TradeBlockListing>
  enquiries: TradeEnquiry[]
}

export interface TradeNegotiationOffer {
  id: string
  threadId: string
  createdAt: string
  expiresAt: string | null
  initiatedBy: 'ai' | 'user' | 'player-request'
  status: 'pending-user' | 'accepted' | 'rejected' | 'countered' | 'withdrawn' | 'expired'
  clubsInvolved: string[]
  proposingClubId: string
  message: string
  playerMoves: TradePlayerMove[]
  pickMoves: TradePickMove[]
  salaryRetentions: TradeSalaryRetention[]
  meta: TradeOfferMeta
}

export interface TradeInboxItem {
  id: string
  offer: TradeNegotiationOffer
  read: boolean
}

export interface TradeExecutionResult {
  ok: boolean
  error?: string
  completedTrade?: import('./game').CompletedTrade
  news?: import('./game').NewsItem
}

// ── Trade Drama ─────────────────────────────────────────────────────────────

export type TradeEventType =
  | 'new-offer'
  | 'rival-bid'
  | 'offer-improved'
  | 'offer-withdrawn'
  | 'deadline-pressure'
  | 'player-push'
  | 'rival-withdrew'

export interface TradeInboxEvent {
  id: string
  date: string
  type: TradeEventType
  clubId?: string
  playerId?: string
  offerId?: string
  message: string
  /** Which side this event benefits */
  leverageShift: 'buyer' | 'seller' | 'neutral'
  demandDelta?: number
}

export interface BiddingWarCluster {
  playerId: string
  /** All clubs currently competing for this player */
  clubIds: string[]
  startedAt: string
  intensity: 'mild' | 'moderate' | 'hot'
}

export interface TradeDramaState {
  /** Chronological event log (capped at 100) */
  events: TradeInboxEvent[]
  /** Active bidding wars indexed by player */
  biddingWars: BiddingWarCluster[]
}

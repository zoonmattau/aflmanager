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
